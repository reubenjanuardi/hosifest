-- 003_sales_phases_and_ticket_offers.sql
-- Sales phases and ticket offers (configurable pricing + quota).
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------- sales_phases
-- Exactly three operational phases are SEEDED (EARLY_BIRD, PRESALE, NORMAL).
-- The table itself does not restrict the count; the backend resolves the active phase.

CREATE TABLE IF NOT EXISTS sales_phases (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id           UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    code               VARCHAR(50) NOT NULL,
    name               VARCHAR(150) NOT NULL,
    start_at           TIMESTAMPTZ,
    end_at             TIMESTAMPTZ,
    visibility         VARCHAR(30) NOT NULL DEFAULT 'PUBLIC',
    status             VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    display_order      INTEGER NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT sales_phases_code_chk
        CHECK (code IN ('EARLY_BIRD', 'PRESALE', 'NORMAL')),
    CONSTRAINT sales_phases_visibility_chk
        CHECK (visibility IN ('PUBLIC', 'RESTRICTED', 'HIDDEN')),
    CONSTRAINT sales_phases_status_chk
        CHECK (status IN ('SCHEDULED', 'ACTIVE', 'CLOSED', 'ARCHIVED')),
    CONSTRAINT sales_phases_dates_chk
        CHECK (start_at IS NULL OR end_at IS NULL OR end_at >= start_at),
    CONSTRAINT sales_phases_event_code_key UNIQUE (event_id, code)
);

CREATE INDEX IF NOT EXISTS sales_phases_event_status_idx ON sales_phases (event_id, status);

DROP TRIGGER IF EXISTS trg_sales_phases_updated_at ON sales_phases;
CREATE TRIGGER trg_sales_phases_updated_at
    BEFORE UPDATE ON sales_phases
    FOR EACH ROW EXECUTE FUNCTION hosifest_set_updated_at();

-- ---------------------------------------------------------- ticket_offers
-- sold_quantity + reserved_quantity <= quota  (BR-TKT-03 / 13-domain-model #9)

CREATE TABLE IF NOT EXISTS ticket_offers (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sales_phase_id     UUID NOT NULL REFERENCES sales_phases(id) ON DELETE RESTRICT,
    code               VARCHAR(80) NOT NULL,
    name               VARCHAR(150) NOT NULL,
    description        TEXT,
    base_price         BIGINT NOT NULL,
    quota              INTEGER NOT NULL,
    reserved_quantity  INTEGER NOT NULL DEFAULT 0,
    sold_quantity      INTEGER NOT NULL DEFAULT 0,
    purchase_limit_min INTEGER,
    purchase_limit_max INTEGER,
    active_from        TIMESTAMPTZ,
    active_until       TIMESTAMPTZ,
    visibility         VARCHAR(30) NOT NULL DEFAULT 'PUBLIC',
    sales_channel      VARCHAR(30) NOT NULL DEFAULT 'ONLINE',
    status             VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    sort_order         INTEGER NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ticket_offers_visibility_chk
        CHECK (visibility IN ('PUBLIC', 'RESTRICTED', 'HIDDEN')),
    CONSTRAINT ticket_offers_channel_chk
        CHECK (sales_channel IN ('ONLINE', 'OFFLINE', 'BOTH')),
    CONSTRAINT ticket_offers_status_chk
        CHECK (status IN ('DRAFT', 'ACTIVE', 'SOLD_OUT', 'CLOSED', 'ARCHIVED')),
    CONSTRAINT ticket_offers_base_price_chk CHECK (base_price >= 0),
    CONSTRAINT ticket_offers_quota_chk      CHECK (quota >= 0),
    CONSTRAINT ticket_offers_reserved_chk   CHECK (reserved_quantity >= 0),
    CONSTRAINT ticket_offers_sold_chk       CHECK (sold_quantity >= 0),
    CONSTRAINT ticket_offers_capacity_chk
        CHECK (sold_quantity + reserved_quantity <= quota),
    -- One CHECK accepts exactly one expression, so the three conditions are
    -- combined inside a single parenthesised boolean expression.
    CONSTRAINT ticket_offers_purchase_limits_chk CHECK (
        (purchase_limit_min IS NULL OR purchase_limit_min >= 0)
        AND (purchase_limit_max IS NULL OR purchase_limit_max >= 0)
        AND (purchase_limit_min IS NULL OR purchase_limit_max IS NULL
             OR purchase_limit_max >= purchase_limit_min)
    ),
    CONSTRAINT ticket_offers_active_window_chk
        CHECK (active_from IS NULL OR active_until IS NULL OR active_until >= active_from),
    CONSTRAINT ticket_offers_phase_code_key UNIQUE (sales_phase_id, code)
);

CREATE INDEX IF NOT EXISTS ticket_offers_phase_status_idx ON ticket_offers (sales_phase_id, status);

DROP TRIGGER IF EXISTS trg_ticket_offers_updated_at ON ticket_offers;
CREATE TRIGGER trg_ticket_offers_updated_at
    BEFORE UPDATE ON ticket_offers
    FOR EACH ROW EXECUTE FUNCTION hosifest_set_updated_at();

