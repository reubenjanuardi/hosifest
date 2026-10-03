# Backend -> Root: verification status and open questions

Superseded by `database-agent-bugs.md` (reproduced migration/seeder defects).
This file now records what the backend has VERIFIED and what is still open.

---

## Verified against a real PostgreSQL 17.10

I stood up a throwaway PostgreSQL instance, applied the database agent's
`migrations/*.sql` and `seeders/*.sql`, and executed the backend's actual SQL.
Results:

| Claim | Evidence |
|---|---|
| Quota cannot be oversold by the guarded UPDATE | 10 concurrent sessions vs `quota = 5` → `reserved_quantity = 5`, never 6 |
| Guarded UPDATE returns 0 rows when capacity is gone | `UPDATE 0` observed, counters unchanged |
| Order creation sets a 30-minute deadline | `ROUND(EXTRACT(EPOCH FROM (expires_at - created_at))/60)` = `30` |
| Order totals persisted server-side | subtotal 250000 / discount 0 / total 250000 |
| Approval is idempotent | first `UPDATE 1`, repeat `UPDATE 0`, ticket count stayed `1` |
| At most one active attendance session | duplicate ENTRY raised `duplicate key value violates unique constraint "one_active_attendance_session"` |
| Re-entry works (AC-ATT-04) | ENTRY → EXIT → RE-ENTRY → EXIT produced 2 sessions |
| Audit log is append-only | `UPDATE audit_logs` raised `audit_logs is append-only` |
| Discount ledger / souvenirs / benefits / history insert cleanly | all counts 1 after insert |
| Reporting views return data | `v_offer_capacity`, `v_discount_usage_summary`, `v_ticket_attendance_state` all queried successfully |

**Not verified here:** anything requiring node-postgres to connect. This
environment forbids every TCP bind (`EACCES`), and node-postgres on Windows
cannot reach a Unix-domain socket, so the TypeScript service layer could not be
driven in-process. The SQL itself is proven; the TS wrappers around it are
covered by unit tests plus `tests/integration/*.test.ts`, which run in CI where
TCP is available.

---

## Open questions for Root

### CI-06 — order status naming (frontend contract)

`12-business-rules.md` says `PAYMENT_REVIEW`; `17-sequence-diagrams.md` and
`18-frontend-information-architecture.md` say `PAYMENT_SUBMITTED`. The migration
CHECK allows only:

```
WAITING_PAYMENT, PAYMENT_REVIEW, PAID, CANCELLED, EXPIRED, REFUNDED
```

I store and return **`PAYMENT_REVIEW`**. **Frontend must map its display value
`PAYMENT_SUBMITTED` onto backend `PAYMENT_REVIEW`.** If Root prefers the other
name, the migration CHECK must change too.

### CI-02 / CI-03 — `max_usage_per_customer` cannot be enforced as written

`customers` has no natural key and `seeders` create one row per order, so
"per customer" resolves to "per order". The check is implemented (it joins
`discount_usages -> orders.customer_id`) but cannot aggregate across orders
until a customer identity rule exists. **Decision needed:** per-order semantics,
or add a normalised contact key.

### CI-09 — payment proof upload shape

I accept a server-generated `proofFileKey` + MIME/size metadata and validate
the MIME allowlist and size cap (`StorageService`). `payment_proof_files` exists
for the multi-file history. **Confirm** whether you want a real multipart route
or the upload-then-reference flow.

### CI-11 — Early Bird visibility (AC-EB-01)

The seed marks `EARLY_BIRD` phase and offer as `RESTRICTED`. Public GETs
currently return everything and let the frontend filter. **Decision:** should
`GET /events/:slug/ticket-offers` filter out `visibility <> 'PUBLIC'`?
Currently it does not.

---

## Deviations from `15-database-schema.md`

The migrations are authoritative; I code against them.

| My earlier assumption | Actual migration |
|---|---|
| `discount_code_usages` | `discount_usages` |
| `discount_type = 'FIXED'` | `'FIXED_AMOUNT'` |
| `benefit_selections` table | `ticket_benefit_selections` + `benefit_selections` VIEW |
| (no benefit definition table) | `benefit_definitions` — now used, CI-01 resolved |
| `users.name` | `users.full_name` |
| `products.active` | `products.is_active` |
| `tickets.status` unspecified | `ISSUED`/`USED`/`VOID`/`EXPIRED` |
| allocation table minimal | adds `requires_beverage`, `requires_souvenir`, `sort_order` |
| — | `attendance_sessions` requires `event_id` and `scan_mode` |
| — | `order_items.allocation_id` is a real FK (I use it instead of JSONB) |