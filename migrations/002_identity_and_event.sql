-- 002_identity_and_event.sql
-- Identity (users / roles / permissions) plus event and congregation configuration.
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------- identity

CREATE TABLE IF NOT EXISTS users (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email              VARCHAR(255) NOT NULL,
    full_name          VARCHAR(200) NOT NULL,
    password_hash      VARCHAR(255) NOT NULL,
    status             VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    last_login_at      TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT users_status_chk CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email));

CREATE TABLE IF NOT EXISTS roles (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code               VARCHAR(50) NOT NULL UNIQUE,
    name               VARCHAR(150) NOT NULL,
    description        TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permissions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code               VARCHAR(100) NOT NULL UNIQUE,
    description        TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_id            UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id      UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
    user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id            UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    granted_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, role_id)
);

-- ---------------------------------------------------------------- events

CREATE TABLE IF NOT EXISTS events (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name               VARCHAR(200) NOT NULL,
    slug               VARCHAR(200) NOT NULL UNIQUE,
    description        TEXT,
    starts_at          TIMESTAMPTZ,
    ends_at            TIMESTAMPTZ,
    venue_name         VARCHAR(255),
    venue_address      TEXT,
    status             VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT events_status_chk CHECK (status IN ('DRAFT', 'PUBLISHED', 'ACTIVE', 'ARCHIVED', 'CANCELLED')),
    CONSTRAINT events_dates_chk CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at >= starts_at)
);

-- ------------------------------------------------------- congregations
-- Configurable Early Bird eligibility list (BR-TKT-05 / FR-04).
-- Values are data rows, never hardcoded in application logic.

CREATE TABLE IF NOT EXISTS congregations (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name               VARCHAR(255) NOT NULL,
    code               VARCHAR(80) NOT NULL UNIQUE,
    region             VARCHAR(100),
    active             BOOLEAN NOT NULL DEFAULT TRUE,
    display_order      INTEGER NOT NULL DEFAULT 0,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS congregations_active_order_idx ON congregations (active, display_order);

DROP TRIGGER IF EXISTS trg_congregations_updated_at ON congregations;
CREATE TRIGGER trg_congregations_updated_at
    BEFORE UPDATE ON congregations
    FOR EACH ROW EXECUTE FUNCTION hosifest_set_updated_at();
