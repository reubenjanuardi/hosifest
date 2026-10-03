-- 004_discounts_and_allocations.sql
-- Discount codes (promotion configuration + transactional usage ledger) and
-- offer_allocations (per-offer quota/eligibility splits).
-- Idempotent: safe to re-run.
--
-- NOTE: discount_codes is created BEFORE offer_allocations because the latter
-- references it.

-- ---------------------------------------------------------- discount_codes
-- Code VALUE is configuration seeded by admin (BR-TKT-06). No secret is baked here.

CREATE TABLE IF NOT EXISTS discount_codes (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                        VARCHAR(100) NOT NULL UNIQUE,
    name                        VARCHAR(150) NOT NULL,
    description                 TEXT,
    discount_type               VARCHAR(30) NOT NULL DEFAULT 'FIXED_AMOUNT',
    discount_value              BIGINT NOT NULL,
    max_total_usage             INTEGER,
    max_usage_per_order         INTEGER,
    max_usage_per_customer      INTEGER,
    eligible_ticket_offer_id    UUID,
    eligible_event_id           UUID REFERENCES events(id) ON DELETE SET NULL,
    eligible_congregation_id    UUID REFERENCES congregations(id) ON DELETE SET NULL,
    active_from                 TIMESTAMPTZ,
    active_until                TIMESTAMPTZ,
    status                      VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT discount_codes_type_chk
        CHECK (discount_type IN ('FIXED_AMOUNT', 'PERCENTAGE', 'FIXED_PRICE')),
    CONSTRAINT discount_codes_status_chk
        CHECK (status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED', 'ARCHIVED')),
    CONSTRAINT discount_codes_value_chk   CHECK (discount_value >= 0),
    CONSTRAINT discount_codes_max_total_chk
        CHECK (max_total_usage IS NULL OR max_total_usage >= 0),
    CONSTRAINT discount_codes_max_order_chk
        CHECK (max_usage_per_order IS NULL OR max_usage_per_order > 0),
    CONSTRAINT discount_codes_max_customer_chk
        CHECK (max_usage_per_customer IS NULL OR max_usage_per_customer > 0),
    CONSTRAINT discount_codes_window_chk
        CHECK (active_from IS NULL OR active_until IS NULL OR active_until >= active_from)
);

-- Do it as an idempotent ALTER because ticket_offers may or may not have run yet
-- in a partially-applied database.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'discount_codes_eligible_ticket_offer_fkey'
          AND conrelid = 'discount_codes'::regclass
    ) THEN
        ALTER TABLE discount_codes
            ADD CONSTRAINT discount_codes_eligible_ticket_offer_fkey
            FOREIGN KEY (eligible_ticket_offer_id)
            REFERENCES ticket_offers(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS discount_codes_status_idx ON discount_codes (status, active_from, active_until);
CREATE INDEX IF NOT EXISTS discount_codes_offer_idx ON discount_codes (eligible_ticket_offer_id);

DROP TRIGGER IF EXISTS trg_discount_codes_updated_at ON discount_codes;
CREATE TRIGGER trg_discount_codes_updated_at
    BEFORE UPDATE ON discount_codes
    FOR EACH ROW EXECUTE FUNCTION hosifest_set_updated_at();

-- -------------------------------------------------------- offer_allocations
-- Splits an offer into configurable quota/eligibility buckets.
-- Example (BR-TKT-02): Early Bird -> Hosiana bucket (35, requires discount code)
--                                  -> Mupel JakPus bucket (60, requires congregation).
-- sold_quantity + reserved_quantity <= quota enforced here too.

CREATE TABLE IF NOT EXISTS offer_allocations (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_offer_id    UUID NOT NULL REFERENCES ticket_offers(id) ON DELETE CASCADE,
    code               VARCHAR(80) NOT NULL,
    name               VARCHAR(150) NOT NULL,
    description        TEXT,
    quota              INTEGER NOT NULL,
    reserved_quantity  INTEGER NOT NULL DEFAULT 0,
    sold_quantity      INTEGER NOT NULL DEFAULT 0,
    -- FREE               : no extra condition
    -- CONGREGATION_LIST  : requires one of the offer's CONGREGATION_* allocations
    -- DISCOUNT_CODE      : requires a valid discount code on this allocation
    eligibility_type   VARCHAR(40) NOT NULL DEFAULT 'FREE',
    congregation_id    UUID REFERENCES congregations(id) ON DELETE RESTRICT,
    discount_code_id   UUID REFERENCES discount_codes(id) ON DELETE RESTRICT,
    requires_beverage  BOOLEAN NOT NULL DEFAULT FALSE,
    requires_souvenir  BOOLEAN NOT NULL DEFAULT TRUE,
    status             VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    sort_order         INTEGER NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT offer_allocations_eligibility_chk
        CHECK (eligibility_type IN ('FREE', 'CONGREGATION_LIST', 'DISCOUNT_CODE')),
    CONSTRAINT offer_allocations_status_chk
        CHECK (status IN ('DRAFT', 'ACTIVE', 'SOLD_OUT', 'CLOSED', 'ARCHIVED')),
    CONSTRAINT offer_allocations_quota_chk    CHECK (quota >= 0),
    CONSTRAINT offer_allocations_reserved_chk CHECK (reserved_quantity >= 0),
    CONSTRAINT offer_allocations_sold_chk     CHECK (sold_quantity >= 0),
    CONSTRAINT offer_allocations_capacity_chk
        CHECK (sold_quantity + reserved_quantity <= quota),
    -- CONGREGATION_LIST buckets must point at a configured congregation.
    CONSTRAINT offer_allocations_congregation_chk
        CHECK (
            eligibility_type <> 'CONGREGATION_LIST'
            OR congregation_id IS NOT NULL
        ),
    -- DISCOUNT_CODE buckets must point at a configured discount code.
    CONSTRAINT offer_allocations_discount_chk
        CHECK (
            eligibility_type <> 'DISCOUNT_CODE'
            OR discount_code_id IS NOT NULL
        ),
    CONSTRAINT offer_allocations_offer_code_key UNIQUE (ticket_offer_id, code)
);

CREATE INDEX IF NOT EXISTS offer_allocations_offer_idx ON offer_allocations (ticket_offer_id);
CREATE INDEX IF NOT EXISTS offer_allocations_congregation_idx ON offer_allocations (congregation_id);
CREATE INDEX IF NOT EXISTS offer_allocations_discount_idx ON offer_allocations (discount_code_id);

DROP TRIGGER IF EXISTS trg_offer_allocations_updated_at ON offer_allocations;
CREATE TRIGGER trg_offer_allocations_updated_at
    BEFORE UPDATE ON offer_allocations
    FOR EACH ROW EXECUTE FUNCTION hosifest_set_updated_at();

-- -------------------------------------------------------- discount_usages
-- Transactional reservation/consumption ledger, counted PER TICKET (BR-TKT-06).
-- The backend reserves inside a transaction:
--   INSERT usage (RESERVED) -> on payment approval set CONSUMED
--   on rejection/expiry    -> set RELEASED
-- Cap = max_total_usage. See migrations/README.md for the reservation snippet.

CREATE TABLE IF NOT EXISTS discount_usages (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discount_code_id   UUID NOT NULL REFERENCES discount_codes(id) ON DELETE RESTRICT,
    order_id           UUID NOT NULL,
    ticket_id          UUID,
    quantity           INTEGER NOT NULL DEFAULT 1,
    status             VARCHAR(30) NOT NULL DEFAULT 'RESERVED',
    reserved_at        TIMESTAMPTZ,
    released_at        TIMESTAMPTZ,
    consumed_at        TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT discount_usages_status_chk
        CHECK (status IN ('RESERVED', 'CONSUMED', 'RELEASED')),
    CONSTRAINT discount_usages_quantity_chk CHECK (quantity > 0),
    CONSTRAINT discount_usages_consumed_chk
        CHECK (status <> 'CONSUMED' OR consumed_at IS NOT NULL),
    CONSTRAINT discount_usages_released_chk
        CHECK (status <> 'RELEASED' OR released_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS discount_usages_code_status_idx ON discount_usages (discount_code_id, status);
CREATE INDEX IF NOT EXISTS discount_usages_order_idx ON discount_usages (order_id);
CREATE INDEX IF NOT EXISTS discount_usages_ticket_idx ON discount_usages (ticket_id);

DROP TRIGGER IF EXISTS trg_discount_usages_updated_at ON discount_usages;
CREATE TRIGGER trg_discount_usages_updated_at
    BEFORE UPDATE ON discount_usages
    FOR EACH ROW EXECUTE FUNCTION hosifest_set_updated_at();

