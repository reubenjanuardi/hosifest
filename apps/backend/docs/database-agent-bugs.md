# DATABASE Agent -> Root: migration + seeder defects (reproduced on PostgreSQL 17.10)

Raised by the BACKEND agent. I did **not** modify `migrations/` or `seeders/`.

All findings below are **reproduced**, not inferred. A clean `psql -f` run over
`migrations/*.sql` in ascending order currently leaves the database with only 4
of the 32 tables; `orders`, `tickets`, `attendance_sessions` and
`discount_usages` never get created.

---

## DB-01 (BLOCKING) — `003`: syntax error, `ticket_offers` is never created

`migrations/003_sales_phases_and_ticket_offers.sql` line 88.

```sql
CONSTRAINT ticket_offers_purchase_limits_chk
    CHECK (
        purchase_limit_min IS NULL OR purchase_limit_min >= 0
    )
    AND (                              -- <-- invalid here
        ...
```

`CHECK` accepts exactly one expression. A trailing `AND (...)` after the
parenthesised `CHECK (...)` is a syntax error.

```
ERROR:  syntax error at or near "AND"
LINE 37:        AND (
```

Minimal reproduction confirms it. **Fix:** wrap the whole thing in one pair of
parentheses so the `AND`s are inside the `CHECK`:

```sql
CONSTRAINT ticket_offers_purchase_limits_chk CHECK (
    (purchase_limit_min IS NULL OR purchase_limit_min >= 0)
    AND (purchase_limit_max IS NULL OR purchase_limit_max >= 0)
    AND (purchase_limit_min IS NULL OR purchase_limit_max IS NULL
         OR purchase_limit_max >= purchase_limit_min)
),
```

**Impact:** everything downstream fails — `006`, `007`, `009` all abort with
`relation "ticket_offers" does not exist`.

---

## DB-02 (BLOCKING) — `004` and `007`: `information_schema.table_constraints.conname` does not exist

Both files use this idempotency guard:

```sql
SELECT 1 FROM information_schema.table_constraints
 WHERE conname = '...'
```

`information_schema.table_constraints` has **no** `conname` column. The
constraint name lives in `pg_constraint.conname` (or is derived by Postgres
from `constraint_name`). Proof:

```
ERROR:  column "conname" does not exist
```

**Fix (both files):** query `pg_constraint` instead:

```sql
SELECT 1 FROM pg_constraint WHERE conname = '...'
```

**Impact:** `004` fails, so `offer_allocations` and `discount_usages` never
exist; `007` and `009` then fail on those.

---

## DB-03 (BLOCKING) — `008`: plpgsql parameters out of order

`migrations/008_audit_logs_and_order_history.sql`, functions
`hosifest_reserve_ticket_offer` and `hosifest_release_ticket_offer`:

```sql
CREATE OR REPLACE FUNCTION hosifest_reserve_ticket_offer(
    p_ticket_offer_id UUID,
    p_allocation_id   UUID DEFAULT NULL,
    p_quantity        INTEGER,           -- no default
    p_increment_sold  BOOLEAN DEFAULT FALSE
```

```
ERROR:  input parameters after one with a default value must also have defaults
```

**Fix:** give `p_quantity` a default (`INTEGER DEFAULT 1`), or move it after
the defaulted parameters. Note `hosifest_reserve_ticket_offer` is the
concurrency primitive for quota, so this matters beyond compilation.

---

## DB-04 (BLOCKING) — seeders: allocation rows violate their own CHECK constraints

`seeders/005_ticket_offers.sql` cannot apply after the migrations.

**4a.** `EARLY_BIRD_HOSIANA` is inserted as
`'DISCOUNT_CODE', <congregation_id>, NULL` — a `DISCOUNT_CODE` bucket with
`discount_code_id IS NULL`:

```
ERROR:  new row for relation "offer_allocations" violates check constraint
        "offer_allocations_discount_chk"
```

but the comment says `discount_code_id` "is filled by `006_discount_codes.sql`
after the code exists". The CHECK forbids exactly that two-step plan.

**4b.** `EARLY_BIRD_MUPEL_JKP` is inserted as
`'CONGREGATION_LIST', NULL, NULL` — congregation-scoped with no congregation:

```
ERROR:  new row for relation "offer_allocations" violates check constraint
        "offer_allocations_congregation_chk"
```

**Fix options (Root decision):**
- (a) Insert the discount code before the allocations and populate
  `discount_code_id` in the same statement; and
- (b) For "any of the 12 Mupel congregations", a single `congregation_id`
  column cannot express a set. Either seed one `CONGREGATION_LIST` row per
  congregation (12 rows of quota 60/12 each, which changes the quota
  arithmetic), or relax the CHECK, or add a join table.

**This is a real modelling gap, not just a seeder bug.** `13-domain-model.md`
says the Mupel bucket is "restricted to configured congregations", but the
schema can only point at one congregation per allocation row.

---

## DB-05 (non-blocking, please confirm) — status value names differ from my first pass

My backend was written against `15-database-schema.md`. The real migrations use
a superset. I have already adapted the backend to the migrations (migrations
are authoritative). Flagging the notable ones so Frontend/Root align:

| Column | `15-database-schema.md` | Actual migrations |
|---|---|---|
| `discount_codes.discount_type` | `FIXED` | **`FIXED_AMOUNT`** |
| `discount_codes` FK | inline `REFERENCES ticket_offers(id)` | added later via `pg_constraint` guard |
| `users` | `name` | **`full_name`** |
| `tickets.status` | unspecified | `ISSUED`/`USED`/`VOID`/`EXPIRED` (no `VALID`) |
| `ticket_benefit_selections` | `benefit_selections` | real table + **`benefit_selections` VIEW** |
| `offer_allocations` | — | adds `requires_beverage`, `requires_souvenir`, `sort_order` |
| `ticket_offers` | — | adds `active_from`/`active_until`, `sort_order` |
| `discount_code_usages` | | **`discount_usages`** |

---

## DB-06 (already correctly resolved) — `benefit_definitions`

My earlier report raised this as blocking. It now exists in `005_catalogs.sql`
with exactly the shape needed for BR-BEN-02. **No action needed** — I will
switch the backend from the `offer_benefits` fallback to this table.