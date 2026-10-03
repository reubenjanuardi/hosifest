-- 008_audit_logs_and_order_history.sql
-- Immutable audit trail and append-only order state-transition history.
-- Idempotent: safe to re-run.

-- -------------------------------------------------------------- audit_logs
-- Append-only. Sensitive admin changes (prices, quotas, catalogs, approvals,
-- corrections) MUST be written here (BR-ADM-05, FR-17).

CREATE TABLE IF NOT EXISTS audit_logs (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_role         VARCHAR(50),
    action             VARCHAR(100) NOT NULL,
    entity_type        VARCHAR(100) NOT NULL,
    entity_id          UUID,
    before_data        JSONB,
    after_data         JSONB,
    request_id         VARCHAR(100),
    ip_address         INET,
    user_agent         TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_entity_idx    ON audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx     ON audit_logs (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx    ON audit_logs (action, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx   ON audit_logs (created_at DESC);

-- Immutability guard: audit rows may be inserted but never updated or deleted
-- by the application role. Superuser/table-owner bypass is expected.
CREATE OR REPLACE FUNCTION hosifest_forbid_audit_mutation()
RETURNS TRIGGER AS $fn$
BEGIN
    RAISE EXCEPTION
        'audit_logs is append-only; % is not permitted', TG_OP
        USING ERRCODE = 'restrict_violation';
END;
$fn$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_logs_immutable ON audit_logs;
CREATE TRIGGER trg_audit_logs_immutable
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION hosifest_forbid_audit_mutation();

-- ----------------------------------------------------- order_status_history
-- Append-only record of every order state transition.

CREATE TABLE IF NOT EXISTS order_status_history (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id           UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    from_status        VARCHAR(40),
    to_status          VARCHAR(40) NOT NULL,
    reason             TEXT,
    changed_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    changed_by_role    VARCHAR(30),
    metadata           JSONB,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_status_history_order_idx ON order_status_history (order_id, created_at);

-- ---------------------------------------------------- payment_proof_history
-- Storage keys only. Actual files live in object storage (19-docker-architecture).

CREATE TABLE IF NOT EXISTS payment_proof_files (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id         UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    file_key           TEXT NOT NULL,
    mime_type          VARCHAR(120),
    size_bytes         BIGINT,
    uploaded_by        UUID REFERENCES users(id) ON DELETE SET NULL,
    uploaded_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    replaced_by        UUID REFERENCES payment_proof_files(id) ON DELETE SET NULL,
    is_current         BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS payment_proof_files_payment_idx ON payment_proof_files (payment_id, uploaded_at DESC);

-- Only one current proof file per payment.
CREATE UNIQUE INDEX IF NOT EXISTS payment_proof_files_one_current
    ON payment_proof_files (payment_id)
    WHERE is_current;

CREATE UNIQUE INDEX IF NOT EXISTS payment_proof_files_key_key ON payment_proof_files (file_key);

-- ---------------------------------------------- quota / discount reservation
-- Transactional helpers. All business decisions (eligibility, phase, price)
-- stay in the backend; these functions only enforce the capacity invariants
-- atomically so concurrent buyers cannot exceed a limit (21-testing-strategy
-- "Quota Race" and "Discount Race").

-- Reserve `quantity` units on a ticket offer.
-- Raises 'HOSIFEST_QUOTA_EXHAUSTED' when the offer or an allocation is full.
CREATE OR REPLACE FUNCTION hosifest_reserve_ticket_offer(
    p_ticket_offer_id UUID,
    p_allocation_id   UUID DEFAULT NULL,
    -- Every parameter after one with a DEFAULT must also have a DEFAULT,
    -- so p_quantity defaults to 1 rather than being positional-required.
    p_quantity        INTEGER DEFAULT 1,
    p_increment_sold  BOOLEAN DEFAULT FALSE
) RETURNS VOID AS $fn$
DECLARE
    v_available INTEGER;
BEGIN
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'HOSIFEST_INVALID_QUANTITY: %', p_quantity
            USING ERRCODE = 'restrict_violation';
    END IF;

    -- Lock the offer row for the transaction duration.
    UPDATE ticket_offers
       SET reserved_quantity = reserved_quantity + p_quantity
     WHERE id = p_ticket_offer_id
       AND reserved_quantity + sold_quantity + p_quantity <= quota;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'HOSIFEST_QUOTA_EXHAUSTED: offer %', p_ticket_offer_id
            USING ERRCODE = 'restrict_violation';
    END IF;

    IF p_allocation_id IS NOT NULL THEN
        UPDATE offer_allocations
           SET reserved_quantity = reserved_quantity + p_quantity
         WHERE id = p_allocation_id
           AND reserved_quantity + sold_quantity + p_quantity <= quota;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'HOSIFEST_QUOTA_EXHAUSTED: allocation %', p_allocation_id
                USING ERRCODE = 'restrict_violation';
        END IF;
    END IF;

    -- flip a reservation into a sale, if requested
    IF p_increment_sold THEN
        UPDATE ticket_offers
           SET reserved_quantity = reserved_quantity - p_quantity,
               sold_quantity     = sold_quantity + p_quantity
         WHERE id = p_ticket_offer_id;

        IF p_allocation_id IS NOT NULL THEN
            UPDATE offer_allocations
               SET reserved_quantity = reserved_quantity - p_quantity,
                   sold_quantity     = sold_quantity + p_quantity
             WHERE id = p_allocation_id;
        END IF;
    END IF;
END;
$fn$ LANGUAGE plpgsql;

-- Release a previously reserved quantity (expiry / cancellation).
CREATE OR REPLACE FUNCTION hosifest_release_ticket_offer(
    p_ticket_offer_id UUID,
    p_allocation_id   UUID DEFAULT NULL,
    p_quantity        INTEGER DEFAULT 1
) RETURNS VOID AS $fn$
BEGIN
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RETURN;
    END IF;

    UPDATE ticket_offers
       SET reserved_quantity = GREATEST(0, reserved_quantity - p_quantity)
     WHERE id = p_ticket_offer_id;

    IF p_allocation_id IS NOT NULL THEN
        UPDATE offer_allocations
           SET reserved_quantity = GREATEST(0, reserved_quantity - p_quantity)
         WHERE id = p_allocation_id;
    END IF;
END;
$fn$ LANGUAGE plpgsql;

-- Reserve discount usage capacity, counted per ticket (BR-TKT-06).
-- Raises 'HOSIFEST_DISCOUNT_EXHAUSTED' when the cap would be exceeded.
CREATE OR REPLACE FUNCTION hosifest_reserve_discount_usage(
    p_discount_code_id UUID,
    p_order_id         UUID,
    p_ticket_id        UUID DEFAULT NULL,
    p_quantity         INTEGER DEFAULT 1
) RETURNS UUID AS $fn$
DECLARE
    v_max_total_usage INTEGER;
    v_used            INTEGER;
    v_usage_id        UUID;
BEGIN
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'HOSIFEST_INVALID_QUANTITY: %', p_quantity
            USING ERRCODE = 'restrict_violation';
    END IF;

    -- Lock the discount code row so concurrent buyers serialize here.
    SELECT max_total_usage
      INTO v_max_total_usage
      FROM discount_codes
     WHERE id = p_discount_code_id
       AND status = 'ACTIVE'
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'HOSIFEST_DISCOUNT_NOT_ACTIVE: %', p_discount_code_id
            USING ERRCODE = 'restrict_violation';
    END IF;

    IF v_max_total_usage IS NOT NULL THEN
        SELECT COALESCE(SUM(quantity), 0)
          INTO v_used
          FROM discount_usages
         WHERE discount_code_id = p_discount_code_id
           AND status IN ('RESERVED', 'CONSUMED');

        IF v_used + p_quantity > v_max_total_usage THEN
            RAISE EXCEPTION 'HOSIFEST_DISCOUNT_EXHAUSTED: code %', p_discount_code_id
                USING ERRCODE = 'restrict_violation';
        END IF;
    END IF;

    INSERT INTO discount_usages (
        discount_code_id, order_id, ticket_id, quantity, status, reserved_at
    ) VALUES (
        p_discount_code_id, p_order_id, p_ticket_id, p_quantity, 'RESERVED', now()
    ) RETURNING id INTO v_usage_id;

    RETURN v_usage_id;
END;
$fn$ LANGUAGE plpgsql;

-- Release a discount reservation (expiry / rejection).
CREATE OR REPLACE FUNCTION hosifest_release_discount_usage(
    p_order_id UUID
) RETURNS VOID AS $fn$
BEGIN
    UPDATE discount_usages
       SET status = 'RELEASED', released_at = now()
     WHERE order_id = p_order_id
       AND status = 'RESERVED';
END;
$fn$ LANGUAGE plpgsql;

-- Consume a discount reservation (payment approved).
CREATE OR REPLACE FUNCTION hosifest_consume_discount_usage(
    p_order_id UUID
) RETURNS VOID AS $fn$
BEGIN
    UPDATE discount_usages
       SET status = 'CONSUMED', consumed_at = now()
     WHERE order_id = p_order_id
       AND status = 'RESERVED';
END;
$fn$ LANGUAGE plpgsql;

