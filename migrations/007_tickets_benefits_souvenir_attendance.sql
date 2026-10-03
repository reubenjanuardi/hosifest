-- 007_tickets_benefits_souvenir_attendance.sql
-- Ticket issuance, per-ticket benefit selection, souvenir customization and
-- attendance sessions. Also adds the deferred FKs that could not be declared in
-- earlier files (orders -> discount_usages, tickets -> discount_usages,
-- beverage_options -> benefit_definitions).
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------- tickets
-- One ticket per order_item unit, created only after payment approval (BR-PAY-07).
-- qr_token_hash stores a HASH of an opaque token; the raw token is never stored.

CREATE TABLE IF NOT EXISTS tickets (
    id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_item_id              UUID NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
    ticket_offer_id            UUID NOT NULL REFERENCES ticket_offers(id) ON DELETE RESTRICT,
    ticket_code                VARCHAR(80) NOT NULL UNIQUE,
    qr_token_hash              VARCHAR(255) NOT NULL UNIQUE,
    sequence_number            INTEGER NOT NULL,
    holder_name_snapshot       VARCHAR(200) NOT NULL,
    price_snapshot             BIGINT NOT NULL,
    discount_snapshot          BIGINT NOT NULL DEFAULT 0,
    effective_price_snapshot   BIGINT NOT NULL,
    congregation_id            UUID REFERENCES congregations(id) ON DELETE SET NULL,
    congregation_name_snapshot VARCHAR(255),
    discount_code_id           UUID REFERENCES discount_codes(id) ON DELETE SET NULL,
    allocation_id              UUID REFERENCES offer_allocations(id) ON DELETE SET NULL,
    status                     VARCHAR(30) NOT NULL DEFAULT 'ISSUED',
    issued_at                  TIMESTAMPTZ,
    voided_at                  TIMESTAMPTZ,
    void_reason                TEXT,
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tickets_status_chk
        CHECK (status IN ('ISSUED', 'USED', 'VOID', 'EXPIRED')),
    CONSTRAINT tickets_sequence_chk    CHECK (sequence_number > 0),
    CONSTRAINT tickets_price_chk      CHECK (price_snapshot >= 0),
    CONSTRAINT tickets_discount_chk   CHECK (discount_snapshot >= 0),
    CONSTRAINT tickets_effective_chk  CHECK (effective_price_snapshot >= 0),
    CONSTRAINT tickets_effective_bound_chk
        CHECK (effective_price_snapshot = price_snapshot - discount_snapshot),
    CONSTRAINT tickets_issued_at_chk
        CHECK (status <> 'ISSUED' OR issued_at IS NOT NULL),
    CONSTRAINT tickets_voided_consistency_chk
        CHECK (status <> 'VOID' OR voided_at IS NOT NULL),
    -- One ticket per order_item unit (BR-TKT-08 / 13-domain-model #4).
    CONSTRAINT tickets_order_item_sequence_key UNIQUE (order_item_id, sequence_number)
);

CREATE INDEX IF NOT EXISTS tickets_ticket_code_idx   ON tickets (ticket_code);
CREATE INDEX IF NOT EXISTS tickets_qr_token_hash_idx ON tickets (qr_token_hash);
CREATE INDEX IF NOT EXISTS tickets_order_item_idx     ON tickets (order_item_id);
CREATE INDEX IF NOT EXISTS tickets_offer_status_idx   ON tickets (ticket_offer_id, status);
CREATE INDEX IF NOT EXISTS tickets_status_idx         ON tickets (status, created_at DESC);

DROP TRIGGER IF EXISTS trg_tickets_updated_at ON tickets;
CREATE TRIGGER trg_tickets_updated_at
    BEFORE UPDATE ON tickets
    FOR EACH ROW EXECUTE FUNCTION hosifest_set_updated_at();

-- ------------------------------------------------------ ticket_benefits
-- The customer's chosen benefit for a ticket (BR-BEN-03).
-- `ticket_benefit_selections` is the canonical table name from 14-final-erd;
-- an alias view is provided at the end of this file.

CREATE TABLE IF NOT EXISTS ticket_benefit_selections (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id          UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    benefit_definition_id UUID NOT NULL REFERENCES benefit_definitions(id) ON DELETE RESTRICT,
    benefit_type       VARCHAR(30) NOT NULL,
    beverage_option_id UUID REFERENCES beverage_options(id) ON DELETE RESTRICT,
    quantity           INTEGER NOT NULL DEFAULT 1,
    -- Immutable snapshot of benefit name + selected option at purchase time.
    snapshot           JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ticket_benefit_selections_type_chk
        CHECK (benefit_type IN ('BEVERAGE', 'TUMBLER', 'SOUVENIR', 'OTHER')),
    CONSTRAINT ticket_benefit_selections_quantity_chk CHECK (quantity > 0),
    -- A BEVERAGE selection must point at a beverage option.
    CONSTRAINT ticket_benefit_selections_beverage_chk
        CHECK (
            benefit_type <> 'BEVERAGE'
            OR beverage_option_id IS NOT NULL
        ),
    -- One selection per (ticket, benefit definition) — no duplicate entitlements.
    CONSTRAINT ticket_benefit_selections_unique_key
        UNIQUE (ticket_id, benefit_definition_id)
);

CREATE INDEX IF NOT EXISTS ticket_benefit_selections_ticket_idx
    ON ticket_benefit_selections (ticket_id);
CREATE INDEX IF NOT EXISTS ticket_benefit_selections_beverage_idx
    ON ticket_benefit_selections (beverage_option_id);

-- Backwards-compatible read alias (ERD spells it BENEFIT_SELECTIONS).
CREATE OR REPLACE VIEW benefit_selections AS
    SELECT * FROM ticket_benefit_selections;

-- ----------------------------------------------------- souvenir_customizations
-- Exactly one customization per ticket (BR-SOU-01/02/03).

CREATE TABLE IF NOT EXISTS souvenir_customizations (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id          UUID NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
    status             VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    -- Admin correction after payment requires special permission + audit (BR-SOU-09).
    corrected_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    corrected_at       TIMESTAMPTZ,
    correction_reason  TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT souvenir_customizations_status_chk
        CHECK (status IN (
            'DRAFT', 'CONFIRMED', 'IN_PRODUCTION', 'READY', 'HANDED_OVER', 'CANCELLED'
        ))
);

CREATE INDEX IF NOT EXISTS souvenir_customizations_status_idx
    ON souvenir_customizations (status, created_at DESC);

DROP TRIGGER IF EXISTS trg_souvenir_customizations_updated_at ON souvenir_customizations;
CREATE TRIGGER trg_souvenir_customizations_updated_at
    BEFORE UPDATE ON souvenir_customizations
    FOR EACH ROW EXECUTE FUNCTION hosifest_set_updated_at();

-- ------------------------------------------------------- souvenir_selections
-- Snapshots of the chosen option so later catalog edits never rewrite history.

CREATE TABLE IF NOT EXISTS souvenir_selections (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customization_id       UUID NOT NULL REFERENCES souvenir_customizations(id) ON DELETE CASCADE,
    option_group_id        UUID NOT NULL REFERENCES souvenir_option_groups(id) ON DELETE RESTRICT,
    option_id              UUID NOT NULL REFERENCES souvenir_options(id) ON DELETE RESTRICT,
    quantity               INTEGER NOT NULL DEFAULT 1,
    option_group_snapshot  JSONB NOT NULL,
    option_snapshot        JSONB NOT NULL,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT souvenir_selections_quantity_chk CHECK (quantity > 0),
    CONSTRAINT souvenir_selections_unique_key UNIQUE (customization_id, option_group_id, option_id)
);

CREATE INDEX IF NOT EXISTS souvenir_selections_customization_idx
    ON souvenir_selections (customization_id);
CREATE INDEX IF NOT EXISTS souvenir_selections_option_idx
    ON souvenir_selections (option_id);

-- ------------------------------------------------------ attendance_sessions
-- OUTSIDE <-> INSIDE cycles (BR-ATT-01..04). Re-entry creates a NEW session.
-- Required partial unique index: at most one active session per ticket.

CREATE TABLE IF NOT EXISTS attendance_sessions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id          UUID NOT NULL REFERENCES tickets(id) ON DELETE RESTRICT,
    event_id           UUID NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    entry_at           TIMESTAMPTZ NOT NULL,
    entry_scanned_by   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    entry_gate         VARCHAR(100),
    exit_at            TIMESTAMPTZ,
    exit_scanned_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    exit_gate          VARCHAR(100),
    scan_mode          VARCHAR(30) NOT NULL DEFAULT 'QR',
    notes              TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT attendance_sessions_scan_mode_chk
        CHECK (scan_mode IN ('QR', 'MANUAL_CODE', 'MANUAL_OVERRIDE')),
    CONSTRAINT attendance_sessions_window_chk
        CHECK (exit_at IS NULL OR exit_at >= entry_at),
    -- An exit must record who closed the session.
    CONSTRAINT attendance_sessions_exit_consistency_chk
        CHECK (exit_at IS NULL OR exit_scanned_by IS NOT NULL)
);

-- THE required invariant: a ticket may have at most one OPEN session.
CREATE UNIQUE INDEX IF NOT EXISTS one_active_attendance_session
    ON attendance_sessions (ticket_id)
    WHERE exit_at IS NULL;

CREATE INDEX IF NOT EXISTS attendance_sessions_ticket_idx    ON attendance_sessions (ticket_id, entry_at DESC);
CREATE INDEX IF NOT EXISTS attendance_sessions_entry_scanned_idx ON attendance_sessions (entry_scanned_by, entry_at DESC);
CREATE INDEX IF NOT EXISTS attendance_sessions_exit_scanned_idx  ON attendance_sessions (exit_scanned_by, exit_at DESC);
CREATE INDEX IF NOT EXISTS attendance_sessions_scanned_at_idx    ON attendance_sessions (entry_at DESC, exit_at);
CREATE INDEX IF NOT EXISTS attendance_sessions_event_idx         ON attendance_sessions (event_id, entry_at DESC);

DROP TRIGGER IF EXISTS trg_attendance_sessions_updated_at ON attendance_sessions;
CREATE TRIGGER trg_attendance_sessions_updated_at
    BEFORE UPDATE ON attendance_sessions
    FOR EACH ROW EXECUTE FUNCTION hosifest_set_updated_at();

-- --------------------------------------- deferred FKs from earlier migrations
-- discount_usages could not reference orders/tickets at creation time.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'discount_usages_order_fkey'
          AND conrelid = 'discount_usages'::regclass
    ) THEN
        ALTER TABLE discount_usages
            ADD CONSTRAINT discount_usages_order_fkey
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'discount_usages_ticket_fkey'
          AND conrelid = 'discount_usages'::regclass
    ) THEN
        ALTER TABLE discount_usages
            ADD CONSTRAINT discount_usages_ticket_fkey
            FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'benefit_definitions_source_option_fkey'
          AND conrelid = 'benefit_definitions'::regclass
    ) THEN
        ALTER TABLE benefit_definitions
            ADD CONSTRAINT benefit_definitions_source_option_fkey
            FOREIGN KEY (source_option_id)
            REFERENCES beverage_options(id) ON DELETE RESTRICT;
    END IF;
END $$;

-- One discounted ticket consumes one usage unit (BR-TKT-06 "counted per ticket").
CREATE UNIQUE INDEX IF NOT EXISTS discount_usages_one_per_ticket
    ON discount_usages (ticket_id)
    WHERE ticket_id IS NOT NULL;

