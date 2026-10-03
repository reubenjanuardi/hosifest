-- 010_offer_allocation_congregations.sql
--
-- A CONGREGATION_LIST allocation bucket must accept ANY of the configured
-- congregations (FR-04 lists 12 Mupel Jakarta Pusat congregations for the
-- single 60-ticket Early Bird bucket). A single `offer_allocations.congregation_id`
-- column can only point at ONE congregation, so the set is modelled here.
--
-- This is additive: the single `congregation_id` column is retained so existing
-- single-congregation buckets keep working, and the CHECK that previously forced
-- CONGREGATION_LIST rows to carry one is relaxed to allow the join-table form.

CREATE TABLE IF NOT EXISTS offer_allocation_congregations (
    allocation_id   UUID NOT NULL REFERENCES offer_allocations(id) ON DELETE CASCADE,
    congregation_id UUID NOT NULL REFERENCES congregations(id) ON DELETE RESTRICT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (allocation_id, congregation_id)
);

CREATE INDEX IF NOT EXISTS offer_allocation_congregations_congregation_idx
    ON offer_allocation_congregations (congregation_id);

-- Drop the single-congregation requirement entirely. A CONGREGATION_LIST bucket
-- is now satisfied by rows in offer_allocation_congregations, which is the only
-- representation that can express a set. Business eligibility remains a backend
-- decision (AGENTS.md section 4); the database only stores configuration.
--
-- The constraint is dropped rather than relaxed, because any CHECK that demands
-- congregation_id IS NOT NULL would be violated by the join-table form on
-- INSERT, and Postgres enforces a CHECK on every new row regardless of NOT VALID.
ALTER TABLE offer_allocations
    DROP CONSTRAINT IF EXISTS offer_allocations_congregation_chk;

COMMENT ON TABLE offer_allocation_congregations IS
    'Configured congregation set for a CONGREGATION_LIST offer allocation. '
    'This join table is the only representation of a multi-congregation bucket; '
    'offer_allocations.congregation_id remains for single-congregation use.';
