-- 006_customers_orders_payments.sql
-- Customers, orders, order items and payments.
-- Idempotent: safe to re-run.

-- -------------------------------------------------------------- customers
-- Guest checkout (FR-07): name + phone required, email optional.
-- No unique constraint on email/phone: one person may place several orders.

CREATE TABLE IF NOT EXISTS customers (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name               VARCHAR(200) NOT NULL,
    email              VARCHAR(255),
    phone              VARCHAR(50) NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customers_email_idx  ON customers (lower(email));
CREATE INDEX IF NOT EXISTS customers_phone_idx  ON customers (phone);

DROP TRIGGER IF EXISTS trg_customers_updated_at ON customers;
CREATE TRIGGER trg_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW EXECUTE FUNCTION hosifest_set_updated_at();

-- ---------------------------------------------------------------- orders
-- Order state machine (12-business-rules section 7):
--   WAITING_PAYMENT -> PAYMENT_REVIEW -> PAID
--                                \----> CANCELLED
--   WAITING_PAYMENT --(30 min)--> EXPIRED
-- The CHECK protects the value set only; the transitions themselves are the
-- backend's responsibility (BR: business logic lives in the domain layer).

CREATE TABLE IF NOT EXISTS orders (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number       VARCHAR(50) NOT NULL UNIQUE,
    event_id           UUID NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
    customer_id        UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    status             VARCHAR(40) NOT NULL DEFAULT 'WAITING_PAYMENT',
    subtotal_amount    BIGINT NOT NULL DEFAULT 0,
    discount_amount    BIGINT NOT NULL DEFAULT 0,
    total_amount       BIGINT NOT NULL DEFAULT 0,
    payment_deadline_at TIMESTAMPTZ,
    expires_at         TIMESTAMPTZ,
    cancelled_at       TIMESTAMPTZ,
    expired_at         TIMESTAMPTZ,
    paid_at            TIMESTAMPTZ,
    cancelled_by       UUID REFERENCES users(id) ON DELETE SET NULL,
    cancel_reason      TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT orders_status_chk
        CHECK (status IN (
            'WAITING_PAYMENT', 'PAYMENT_REVIEW', 'PAID',
            'CANCELLED', 'EXPIRED', 'REFUNDED'
        )),
    CONSTRAINT orders_subtotal_chk  CHECK (subtotal_amount >= 0),
    CONSTRAINT orders_discount_chk  CHECK (discount_amount >= 0),
    CONSTRAINT orders_total_chk     CHECK (total_amount >= 0),
    CONSTRAINT orders_discount_bound_chk
        CHECK (discount_amount <= subtotal_amount),
    CONSTRAINT orders_total_bound_chk
        CHECK (total_amount = subtotal_amount - discount_amount),
    CONSTRAINT orders_cancelled_consistency_chk
        CHECK (status <> 'CANCELLED' OR cancelled_at IS NOT NULL),
    CONSTRAINT orders_expired_consistency_chk
        CHECK (status <> 'EXPIRED' OR expired_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS orders_order_number_idx ON orders (order_number);
CREATE INDEX IF NOT EXISTS orders_status_created_idx ON orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_customer_created_idx ON orders (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_event_status_idx ON orders (event_id, status);
-- Supports the expiration sweeper: orders still awaiting payment past deadline.
CREATE INDEX IF NOT EXISTS orders_pending_expiry_idx
    ON orders (expires_at)
    WHERE status IN ('WAITING_PAYMENT', 'PAYMENT_REVIEW');

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION hosifest_set_updated_at();

-- ----------------------------------------------------------- order_items
-- unit_price / item_name_snapshot are IMMUTABLE snapshots (BR-TKT-11).

CREATE TABLE IF NOT EXISTS order_items (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id           UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    item_type          VARCHAR(30) NOT NULL,
    ticket_offer_id    UUID REFERENCES ticket_offers(id) ON DELETE SET NULL,
    product_id         UUID REFERENCES products(id) ON DELETE SET NULL,
    allocation_id      UUID REFERENCES offer_allocations(id) ON DELETE SET NULL,
    quantity           INTEGER NOT NULL,
    unit_price         BIGINT NOT NULL,
    discount_amount    BIGINT NOT NULL DEFAULT 0,
    subtotal_amount    BIGINT NOT NULL,
    item_name_snapshot VARCHAR(255) NOT NULL,
    metadata           JSONB,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT order_items_type_chk
        CHECK (item_type IN ('TICKET', 'PRODUCT')),
    CONSTRAINT order_items_quantity_chk   CHECK (quantity > 0),
    CONSTRAINT order_items_unit_price_chk CHECK (unit_price >= 0),
    CONSTRAINT order_items_discount_chk   CHECK (discount_amount >= 0),
    CONSTRAINT order_items_subtotal_chk
        CHECK (subtotal_amount = (unit_price * quantity) - discount_amount),
    -- A TICKET item must reference an offer; a PRODUCT item must reference a product.
    CONSTRAINT order_items_target_chk
        CHECK (
            (item_type = 'TICKET' AND ticket_offer_id IS NOT NULL AND product_id IS NULL)
            OR
            (item_type = 'PRODUCT' AND product_id IS NOT NULL AND ticket_offer_id IS NULL)
        )
);

CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items (order_id);
CREATE INDEX IF NOT EXISTS order_items_offer_idx ON order_items (ticket_offer_id);

-- --------------------------------------------------------------- payments
-- Manual proof workflow (BR-PAY-01/02/06). One order may have several attempts;
-- only one attempt may end in APPROVED.

CREATE TABLE IF NOT EXISTS payments (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id           UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    method             VARCHAR(30) NOT NULL,
    amount             BIGINT NOT NULL,
    -- Server-generated storage key. Never a public URL, never a client filename.
    proof_file_key     TEXT,
    proof_mime_type    VARCHAR(120),
    external_reference VARCHAR(150),
    status             VARCHAR(30) NOT NULL DEFAULT 'PENDING_PROOF',
    submitted_at       TIMESTAMPTZ,
    reviewed_at        TIMESTAMPTZ,
    reviewed_by        UUID REFERENCES users(id) ON DELETE SET NULL,
    rejection_reason   TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT payments_method_chk
        CHECK (method IN ('QRIS', 'BANK_TRANSFER')),
    CONSTRAINT payments_status_chk
        CHECK (status IN (
            'PENDING_PROOF', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED'
        )),
    CONSTRAINT payments_amount_chk CHECK (amount >= 0),
    CONSTRAINT payments_reviewed_consistency_chk
        CHECK (reviewed_at IS NULL OR status IN ('APPROVED', 'REJECTED', 'CANCELLED')),
    CONSTRAINT payments_submitted_consistency_chk
        CHECK (submitted_at IS NOT NULL OR status = 'PENDING_PROOF')
);

CREATE INDEX IF NOT EXISTS payments_order_idx ON payments (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments (status, created_at DESC);

-- At most one APPROVED payment per order: this is what makes approval
-- idempotent at the storage layer (BR-PAY-07).
CREATE UNIQUE INDEX IF NOT EXISTS one_approved_payment_per_order
    ON payments (order_id)
    WHERE status = 'APPROVED';

DROP TRIGGER IF EXISTS trg_payments_updated_at ON payments;
CREATE TRIGGER trg_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION hosifest_set_updated_at();
