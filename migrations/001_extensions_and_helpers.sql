-- 001_extensions_and_helpers.sql
-- HOSIFEST database migrations (PostgreSQL 16)
-- Applied in ascending filename order. See migrations/README.md
--
-- Purpose: required extensions and shared, idempotent-safe helper functions.
-- Idempotent: safe to re-run.

-- gen_random_uuid() is core since PostgreSQL 13; pgcrypto is kept for portability.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Shared helper: keep updated_at fresh on UPDATE for mutable entities.
-- CREATE OR REPLACE makes re-running a no-op.
CREATE OR REPLACE FUNCTION hosifest_set_updated_at()
RETURNS TRIGGER AS $fn$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;

-- Applied-migration bookkeeping (written by the migration runner, not by hand).
CREATE TABLE IF NOT EXISTS hosifest_migration_version (
    version      VARCHAR(255) PRIMARY KEY,
    applied_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
