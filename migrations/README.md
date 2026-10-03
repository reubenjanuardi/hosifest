# HOSIFEST — Database Migrations

Plain, versioned SQL files applied in **ascending filename order**.
Target: **PostgreSQL 16**.

## Apply contract (for backend / devops)

```
1. Apply every file in migrations/*.sql, sorted ascending by filename.
2. Each file is self-contained and idempotent-safe.
3. Record the filename in hosifest_migration_version after it succeeds.
4. Never skip a file. Never edit an already-applied file — add a new one.
```

Sorting is lexicographic on the zero-padded numeric prefix, so use a
3-digit prefix (`001` … `999`) and keep the numeric part unique.

Files that do not begin with a number (e.g. `README.md`) are not SQL and must
be skipped by the runner.

Every file must be wrapped by the runner in its own transaction, e.g.:

```sql
BEGIN;
-- contents of migrations/NNN_xxx.sql
INSERT INTO hosifest_migration_version (version) VALUES ('NNN_xxx.sql');
COMMIT;
```

### Idempotency rules used in this repo

| Object                          | Guard                                          |
| ------------------------------- | ---------------------------------------------- |
| Tables                          | `CREATE TABLE IF NOT EXISTS`                    |
| Indexes                         | `CREATE [UNIQUE] INDEX IF NOT EXISTS`           |
| Functions                       | `CREATE OR REPLACE FUNCTION`                    |
| Triggers                        | `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER`    |
| Constraints added later via ALTER| `DO $$ ... IF NOT EXISTS (pg_constraint) ... $$`|

Because every object is guarded, re-running the whole folder on a database
that is already at the latest revision is a no-op. This is what makes CI safe.

## Order

| File                                          | Contents |
| --------------------------------------------- | -------- |
| `001_extensions_and_helpers.sql`               | `pgcrypto`, `hosifest_set_updated_at()`, `hosifest_migration_version` |
| `002_identity_and_event.sql`                   | `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `events`, `congregations` |
| `003_sales_phases_and_ticket_offers.sql`       | `sales_phases`, `ticket_offers` (+ quota CHECK) |
| `004_discounts_and_allocations.sql`            | `discount_codes`, `offer_allocations` (+ quota CHECK), `discount_usages` |
| `005_catalogs.sql`                             | `products`, `product_options`, `benefit_definitions`, `beverage_options`, `souvenir_option_groups`, `souvenir_options` |
| `006_customers_orders_payments.sql`            | `customers`, `orders`, `order_items`, `payments` |
| `007_tickets_benefits_souvenir_attendance.sql` | `tickets`, `ticket_benefit_selections`, `souvenir_customizations`, `souvenir_selections`, `attendance_sessions`, deferred FKs |
| `008_audit_logs_and_order_history.sql`         | `audit_logs`, `order_status_history`, `payment_proof_files`, reservation helper functions |
| `009_config_views.sql`                         | read-only configuration/lookup views |

## Rollback

Migrations here are **forward-only by design** (20-ci-cd-pipeline §6/§7):
prefer forward-compatible changes so an application rollback never needs a
destructive database rollback.

There is intentionally no `down/` directory. Rollback is:

1. Stop writes / roll the application back to the last-known-good image SHA.
2. Write a **new** migration that removes or corrects what is wrong.
3. Take a backup before any destructive step (AGENTS.md §4).

If a destructive change is ever required it must be a separate, explicitly
approved migration file — never folded into an existing one.

Destroying the whole schema (acceptable **only** in CI/dev):

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
```

## Concurrency helpers (migration 008)

These functions exist so quota and discount limits are enforced atomically.
All business *decisions* (eligibility, phase, price) stay in the backend.

| Function                                             | Purpose |
| ---------------------------------------------------- | ------- |
| `hosifest_reserve_ticket_offer(offer, allocation, qty, consume)` | reserve, and optionally convert reserve → sold |
| `hosifest_release_ticket_offer(offer, allocation, qty)`          | release a reservation (expiry / cancellation) |
| `hosifest_reserve_discount_usage(code, order, ticket, qty)`      | reserve discount capacity, returns the usage row id |
| `hosifest_release_discount_usage(order)`                          | mark all `RESERVED` usages of an order as `RELEASED` |
| `hosifest_consume_discount_usage(order)`                          | mark all `RESERVED` usages of an order as `CONSUMED` |

All of them raise `restrict_violation` with a `HOSIFEST_*` message prefix on
failure; the backend should map those to
`HOSIFEST_QUOTA_EXHAUSTED` / `HOSIFEST_DISCOUNT_EXHAUSTED` error codes.
Call them **inside** the same transaction that creates the order rows.
