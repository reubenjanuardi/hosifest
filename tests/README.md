# HOSIFEST QA acceptance suite

QA-owned. See `AGENTS.md` section 5 and `.codex/agents/qa.toml`.

These tests validate `hosifest-system-design/23-acceptance-criteria.md` against the
real system. They are **black box**: they drive the compiled backend
(`apps/backend/dist`) against a real PostgreSQL that already has `migrations/*.sql`
and `seeders/*.sql` applied. No business rule is re-implemented here — every
assertion observes what the backend and the database actually do.

## What QA will never do

- Change a business rule, a migration, a seeder or application code to make a
  test pass. A failing test is a defect report, not a licence to edit the app.
- Edit another role's area. Defects are routed to the owning agent.
- Skip a criterion silently. Anything unverified is reported as `BLOCKED`.

## Requirements

- Node.js >= 22 (uses the built-in `node:test` runner; no extra dependencies).
- A PostgreSQL instance with the migrations and seeders applied.
- Docker, for the dynamic infrastructure checks (otherwise they report BLOCKED).

## Running

```bash
# 1. Apply schema + configuration to a throwaway database
cd apps/backend
DATABASE_URL=postgres://.../hosifest_test MIGRATIONS_DIR=../../migrations \
  SEEDERS_DIR=../../seeders node dist-scripts/scripts/migrate.js
DATABASE_URL=postgres://.../hosifest_test SEEDERS_DIR=../../seeders \
  node dist-scripts/scripts/seed.js --include-dev

# 2. Build and run
cd ../../tests
npx tsc -p tsconfig.json
TEST_DATABASE_URL=postgres://.../hosifest_test node --test --test-isolation=none --test-concurrency=1 ".build/qa/*.test.js"
```

`--test-isolation=none` is required on hosts where the agent sandbox blocks
`child_process.spawn`; `--test-concurrency=1` keeps the shared database serial.

## Suites

| File | Covers |
| --- | --- |
| `qa/sales-configuration.test.ts` | AC-SALES-01..05 |
| `qa/early-bird.test.ts` | AC-EB-01..07 |
| `qa/presale.test.ts` | AC-PS-01..05 |
| `qa/souvenir.test.ts` | AC-SOU-01..06 |
| `qa/checkout-payment.test.ts` | AC-CHK-01..06, AC-PAY-01..07 |
| `qa/ticket-attendance.test.ts` | AC-TKT-01..04, AC-ATT-01..08 |
| `qa/security-reporting.test.ts` | AC-SEC-01..05, AC-OPS-01..05 |
| `qa/infrastructure.test.ts` | AC-DEVOPS-01..09, AC-OPS-06 |

`qa/harness.ts` holds the shared fixture: repository-root discovery, seed
identifiers, reset helpers and the admin-actor context.

## Notes for other agents

- `resetAll()` restores every mutable configuration row a test touches. If you
  add a suite that mutates configuration, add the restore to
  `restoreSeedConfiguration()` in the harness, otherwise ordering will matter.
- `audit_logs` is append-only by design (migration 008), so the harness never
  deletes it. Audit assertions scope by `request_id` / `entity_id` instead of
  counting global rows.
- Payment method values are the uppercase enum `QRIS` / `BANK_TRANSFER`
  (`order.schema.ts`, `payments_method_chk`).
