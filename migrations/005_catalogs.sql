-- 005_catalogs.sql
-- Generic commerce catalog (products / product_options) plus benefit, beverage
-- and souvenir configuration catalogs.
-- Idempotent: safe to re-run.
--
-- NOTE: `products` is created here because order_items references it.

-- ---------------------------------------------------------------- products
-- Generic, admin-configurable commerce catalog (04-data-model-erd).
-- Ticket benefits are modeled as benefit_definitions, NOT as paid products.

CREATE TABLE IF NOT EXISTS products (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id           UUID REFERENCES events(id) ON DELETE CASCADE,
    code               VARCHAR(80) NOT NULL UNIQUE,
    name               VARCHAR(200) NOT NULL,
    description        TEXT,
    price              BIGINT NOT NULL,
    stock              INTEGER,
    is_active          BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order         INTEGER NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT products_price_chk CHECK (price >= 0),
    CONSTRAINT products_stock_chk CHECK (stock IS NULL OR stock >= 0)
);

CREATE TABLE IF NOT EXISTS product_options (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id         UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    code               VARCHAR(80) NOT NULL,
    name               VARCHAR(200) NOT NULL,
    price_delta        BIGINT NOT NULL DEFAULT 0,
    is_active          BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order         INTEGER NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT product_options_price_delta_chk CHECK (price_delta >= 0),
    CONSTRAINT product_options_product_code_key UNIQUE (product_id, code)
);

-- ------------------------------------------------------- benefit_definitions
-- Included entitlement of a ticket offer (BR-BEN-02).
-- Example: PRESALE offer -> BEVERAGE x1, TUMBLER x1.
-- Quantity is configuration, never hardcoded.

CREATE TABLE IF NOT EXISTS benefit_definitions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_offer_id    UUID NOT NULL REFERENCES ticket_offers(id) ON DELETE CASCADE,
    benefit_type       VARCHAR(30) NOT NULL,
    name               VARCHAR(150) NOT NULL,
    quantity           INTEGER NOT NULL DEFAULT 1,
    -- Which catalog the customer selects from. NULL = fulfilled without a choice
    -- (e.g. a TUMBLER included automatically).
    source_type        VARCHAR(30),
    source_option_id   UUID,
    is_mandatory       BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order         INTEGER NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT benefit_definitions_type_chk
        CHECK (benefit_type IN ('BEVERAGE', 'TUMBLER', 'SOUVENIR', 'OTHER')),
    CONSTRAINT benefit_definitions_source_chk
        CHECK (source_type IS NULL OR source_type IN ('BEVERAGE_OPTIONS', 'PRODUCT_OPTIONS')),
    CONSTRAINT benefit_definitions_quantity_chk CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS benefit_definitions_offer_idx ON benefit_definitions (ticket_offer_id);

DROP TRIGGER IF EXISTS trg_benefit_definitions_updated_at ON benefit_definitions;
CREATE TRIGGER trg_benefit_definitions_updated_at
    BEFORE UPDATE ON benefit_definitions
    FOR EACH ROW EXECUTE FUNCTION hosifest_set_updated_at();

-- ------------------------------------------------------- beverage_options
-- Dynamic Presale beverage catalog (BR-BEN-04). Seeded with ES_KOPI_SUSU / MILK_TEA.

CREATE TABLE IF NOT EXISTS beverage_options (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code               VARCHAR(80) NOT NULL UNIQUE,
    name               VARCHAR(150) NOT NULL,
    description        TEXT,
    image_url          TEXT,
    active             BOOLEAN NOT NULL DEFAULT TRUE,
    display_order      INTEGER NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS beverage_options_active_order_idx ON beverage_options (active, display_order);

DROP TRIGGER IF EXISTS trg_beverage_options_updated_at ON beverage_options;
CREATE TRIGGER trg_beverage_options_updated_at
    BEFORE UPDATE ON beverage_options
    FOR EACH ROW EXECUTE FUNCTION hosifest_set_updated_at();

-- ------------------------------------------------- souvenir_option_groups
-- Configurable grouping of keychain customization choices (BR-SOU-06).

CREATE TABLE IF NOT EXISTS souvenir_option_groups (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code               VARCHAR(80) NOT NULL UNIQUE,
    name               VARCHAR(150) NOT NULL,
    description        TEXT,
    selection_min      INTEGER NOT NULL DEFAULT 0,
    selection_max      INTEGER NOT NULL DEFAULT 1,
    display_order      INTEGER NOT NULL DEFAULT 0,
    active             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT souvenir_option_groups_selection_chk
        CHECK (selection_min >= 0 AND selection_max >= selection_min)
);

CREATE TABLE IF NOT EXISTS souvenir_options (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    option_group_id    UUID NOT NULL REFERENCES souvenir_option_groups(id) ON DELETE CASCADE,
    code               VARCHAR(80) NOT NULL,
    name               VARCHAR(150) NOT NULL,
    description        TEXT,
    image_url          TEXT,
    metadata           JSONB,
    display_order      INTEGER NOT NULL DEFAULT 0,
    active             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT souvenir_options_group_code_key UNIQUE (option_group_id, code)
);

CREATE INDEX IF NOT EXISTS souvenir_options_group_idx ON souvenir_options (option_group_id, display_order);

DROP TRIGGER IF EXISTS trg_souvenir_option_groups_updated_at ON souvenir_option_groups;
CREATE TRIGGER trg_souvenir_option_groups_updated_at
    BEFORE UPDATE ON souvenir_option_groups
    FOR EACH ROW EXECUTE FUNCTION hosifest_set_updated_at();

DROP TRIGGER IF EXISTS trg_souvenir_options_updated_at ON souvenir_options;
CREATE TRIGGER trg_souvenir_options_updated_at
    BEFORE UPDATE ON souvenir_options
    FOR EACH ROW EXECUTE FUNCTION hosifest_set_updated_at();
