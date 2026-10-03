# HOSIFEST — Wave 1 acceptance report

Gate document: `hosifest-system-design/23-acceptance-criteria.md`
Date: 2026-10-03 · Role: QA · Suite: `tests/qa/`

## Verdict

**NOT PRODUCTION READY. NOT EVEN RELEASE CANDIDATE.**

**37 of 68** acceptance criteria pass. **31 fail.** 3 dynamic infrastructure
checks are **BLOCKED** (no Docker daemon reachable).

The release gate in section "Release Gate" requires critical automated tests to
pass, Docker images to build, a production-like deployment to succeed, health
checks to pass and migration to be verified. **Four independent blockers stop
that gate today** — see D1, D2, D4 and D7. No business rule was changed to make
any test pass.

## How this was verified

- Real PostgreSQL 17, `migrations/001..010` applied, `seeders/001..008` applied
  including `--include-dev` fixtures.
- The compiled backend (`apps/backend/dist`) driven as a black box. No business
  rule is re-implemented in the suite.
- 115 automated assertions across 9 suites, all under the QA-owned `tests/`.
- Docker builds and a production-like Compose stack-up could **not** be executed
  from this environment (no daemon). Those checks report BLOCKED, never PASS.

## Defects, routed to the owning agent

### D1 — CRITICAL — BACKEND — every discounted order is impossible

`apps/backend/src/modules/order/order.service.ts`, `insertOrderItems`.

Migration `006` pins `order_items_subtotal_chk CHECK (subtotal_amount =
(unit_price * quantity) - discount_amount)`. The insert supplies `unit_price` as
the **gross** unit price, `discount_amount` as discount × quantity, and
`subtotal_amount` as the **gross** line total. For one Hosiana ticket that is
`175000 = 175000 - 25000`, which is false, so the insert is rejected.

Reproduced for quantity 1 and quantity 2. The order is created inside one
transaction, so nothing is committed.

Impact: the entire discounted Early Bird Hosiana offer — 35 tickets,
AC-EB-04/05/06, Flow A of the testing strategy — cannot be sold at all.

Fix direction: make the insert agree with the migration. Do **not** relax the
constraint; if the constraint is genuinely wrong, that is a DATABASE migration
and needs Root approval.

### D2 — CRITICAL — BACKEND — payment approval fails on every paid order

`apps/backend/src/modules/payment/payment.service.ts`, `linkUsagesToTickets`.

The query is `SELECT t.id, t.ticket_id FROM tickets t ...`. The `tickets` table
has `id`, `ticket_code`, `qr_token_hash` and no `ticket_id` column. PostgreSQL
raises `42703 column t.ticket_id does not exist`, which rolls back the whole
approval transaction.

Impact: an order never reaches PAID and no ticket is ever issued. This is a
single-point failure blocking AC-PAY-02/03, all of AC-TKT-*, all of AC-ATT-*,
AC-SOU-01/03/05/06 and AC-OPS-01/02/05.

Regression probe: `tests/qa/critical-defects.regression.test.ts`.

### D3 — HIGH — BACKEND — late-proof lazy expiry is rolled back by its own error

`apps/backend/src/modules/order/order.query.service.ts`, `submitPaymentProof`.

On an overdue order the service calls `expiry.expireWithin(...)` and then throws
`ORDER_EXPIRED` inside the same transaction. The throw rolls the expiry back, so
the order stays `WAITING_PAYMENT` and keeps its quota reservation until a sweeper
happens to run. Observed: status remained `WAITING_PAYMENT`, `reserved_quantity`
still 2.

Violates BR-PAY-03 and AC-CHK-05/AC-CHK-06 for the lazy path. (The background
sweeper path is correct — `sweepExpiredOrders` releases everything.)

### D4 — CRITICAL — DATABASE, contract with BACKEND — no seeded user can log in

`seeders/002_dev_users.sql` stores **bcrypt** hashes (`$2y$10$...`) and
documents the passwords `DevAdmin!2024`, `DevFinance!2024`, `DevCheckin!2024`,
`DevSouvenir!2024`.

`apps/backend/src/modules/identity/password.ts` `verifyPassword()` accepts only
its own **scrypt** encoding (`scrypt$salt$hash`) and returns `false` for
anything else. Every seeded account is permanently locked out.

Impact: no SUPER_ADMIN, FINANCE, CHECKIN or SOUVENIR operator can authenticate in
any environment seeded with `--include-dev`, so the entire admin plane is
unreachable and AC-SEC-05 cannot pass.

Root decision (cross-area contract, resolved here): the canonical stored format is
the backend's `hashPassword()` output, `scrypt$salt$hash`. DATABASE must
regenerate the seeder with that format. The hashes must be produced by the
canonical function, not hand-written, so a generation step is needed.

### D5 — CRITICAL — BACKEND — the Mupel Jakarta Pusat Early Bird bucket is unreachable

`apps/backend/src/modules/sales/sales.service.ts` `resolveAllocation`, plus
`order.service.ts` `assertCongregationMatchesAllocation`.

Congregation membership is stored in `offer_allocation_congregations`
(migration `010`, seeder `008`) because one `offer_allocations.congregation_id`
column cannot express a set of 12. But `resolveAllocation` matches **only**
`row.congregation_id === congregationId`, and the Mupel bucket's
`congregation_id` is `NULL`. So for a Paulus customer there is no scoped match
and no `FREE` bucket, and the method falls back to `rows[0]` — the Hosiana
`DISCOUNT_CODE` bucket. `assertCongregationMatchesAllocation` then compares
Paulus against the Hosiana bucket and rejects it with
`CONGREGATION_NOT_ELIGIBLE`.

Observed: `details: { allocationId: EARLY_BIRD_HOSIANA, congregationId: Paulus }`.

Impact: 60 of the 95 Early Bird tickets are unsellable (testing-strategy Flow B
cannot run). A congregation-less Early Bird attempt reports
`INVALID_DISCOUNT_CODE` instead of `CONGREGATION_REQUIRED`, inviting the wrong
fix. AC-EB-02 currently "passes" its negative case only coincidentally.

Fix direction: resolve the bucket from `offer_allocation_congregations`, and never
fall back to an unrelated `DISCOUNT_CODE` bucket.

### D6 — HIGH — BACKEND — a RESTRICTED offer is served by the public listing

`apps/backend/src/modules/event/public.routes.ts` and
`SalesService.listTicketOffers` return every offer regardless of
`ticket_offers.visibility` and `sales_phases.visibility`.

`GET /events/:slug/ticket-offers` is unauthenticated and currently returns
Early Bird with `visibility=RESTRICTED` together with its price, quota and
remaining availability. AC-EB-01 requires a restricted offer not to be exposed as
an unrestricted public offer.

### D7 — HIGH — BACKEND — the built artifact cannot run migrations

`tsconfig.scripts.json` (`rootDir: "."`, `outDir: "dist-scripts"`) emits
`dist-scripts/scripts/migrate.js`, whose relative import `../src/db/database.js`
resolves inside `dist-scripts/`. The `build` npm script then moves the file to
`dist/scripts/` and deletes `dist-scripts/`, so the import resolves to
`dist/src/db/database.js`, which does not exist.

```
$ node dist/scripts/migrate.js
Error [ERR_MODULE_NOT_FOUND]: .../dist/src/db/database.js
```

The backend Dockerfile copies only `dist`, so the image ships no working migrate
or seed script, and `deploy/scripts/deploy.sh` runs
`compose run --rm --no-deps backend npm run migrate`. **Every production deploy
fails at the migration step.** The release-gate item "migration is verified"
cannot pass.

### D8 — MEDIUM — ROOT / DEVOPS — the acceptance suite is not wired into CI

`.github/workflows/ci.yml` runs only the `apps/backend` vitest suites. The
`tests/` suite that actually validates `23-acceptance-criteria.md` is never
executed by any pipeline, so none of these defects would have been caught.

Supporting gap: `tests/` is not a workspace package, so a root install will not
provide its dependencies, and it borrows `@types/node` from
`apps/backend/node_modules` via `typeRoots` in `tests/tsconfig.json`.

### D9 — MEDIUM — QA environment — Docker verification BLOCKED

No Docker daemon is reachable from the verification environment, so the dynamic
build, `docker compose config` validation and production-like stack-up could not
run. Static assertions over `Dockerfile`, the compose file and the workflows all
pass. AC-DEVOPS-01/02 dynamic confirmation is still owed.

## Acceptance matrix

Legend: PASS · FAIL · (blocked by defect)

| Group | Criterion | Result | Note |
| --- | --- | --- | --- |
| A Sales | AC-SALES-01 | PASS | phase dates re-gate sales via admin API |
| A Sales | AC-SALES-02 | PASS | admin price change is what the server charges |
| A Sales | AC-SALES-03 | PASS | admin quota change is what the engine enforces |
| A Sales | AC-SALES-04 | PASS | 95 = 35 + 60, Presale 55, Normal 50, total 200 |
| A Sales | AC-SALES-05 | PASS | oversell refused; reserved + sold never exceeds quota |
| B Early Bird | AC-EB-01 | FAIL | D6 |
| B Early Bird | AC-EB-02 | FAIL | D5 |
| B Early Bird | AC-EB-03 | PASS | 12 Jakarta Pusat congregations, all linked |
| B Early Bird | AC-EB-04 | FAIL | D1, D5 |
| B Early Bird | AC-EB-05 | FAIL | D1 — cap is seeded at 35 but unreachable |
| B Early Bird | AC-EB-06 | FAIL | D1, D5 |
| B Early Bird | AC-EB-07 | FAIL | D1, D5 |
| C Presale | AC-PS-01 | PASS | Rp225.000 |
| C Presale | AC-PS-02 | FAIL | config correct; materialisation D2 |
| C Presale | AC-PS-03 | PASS | per-ticket beverage mandatory, order-wide rejection |
| C Presale | AC-PS-04 | PASS | admin-added beverage sells immediately |
| C Presale | AC-PS-05 | PASS | Es Kopi Susu + Milk Tea seeded |
| D Souvenir | AC-SOU-01 | FAIL | D2 |
| D Souvenir | AC-SOU-02 | PASS | empty / partial / mismatched / inactive all refused |
| D Souvenir | AC-SOU-03 | FAIL | D2 |
| D Souvenir | AC-SOU-04 | PASS | admin-added group + option selectable |
| D Souvenir | AC-SOU-05 | PASS | price identical regardless of customization |
| D Souvenir | AC-SOU-06 | FAIL | D2 |
| E Checkout | AC-CHK-01 | PASS | 4 tickets in one order |
| E Checkout | AC-CHK-02 | PASS | no client-settable total field; server recomputes |
| E Checkout | AC-CHK-03 | PASS | 10 concurrent buyers vs quota 5 → exactly 5 |
| E Checkout | AC-CHK-04 | PASS | expires_at and payment_deadline_at both 30 min |
| E Checkout | AC-CHK-05 | FAIL | D3 |
| E Checkout | AC-CHK-06 | PASS | sweeper path releases quota; lazy path D3 |
| F Payment | AC-PAY-01 | PASS | QRIS and BANK_TRANSFER accepted |
| F Payment | AC-PAY-02 | FAIL | D2 — approval cannot succeed |
| F Payment | AC-PAY-03 | FAIL | D2 |
| F Payment | AC-PAY-04 | PASS | immediate CANCELLED, cancelled_at stamped |
| F Payment | AC-PAY-05 | PASS | offer and allocation quota released |
| F Payment | AC-PAY-06 | PASS | discount ledger moved to RELEASED |
| F Payment | AC-PAY-07 | PASS | cancelled order refuses retry; new order works |
| G Ticket | AC-TKT-01 | FAIL | D2 |
| G Ticket | AC-TKT-02 | FAIL | D2 |
| G Ticket | AC-TKT-03 | FAIL | D2 |
| G Ticket | AC-TKT-04 | FAIL | D2 |
| H Attendance | AC-ATT-01 | FAIL | D2 |
| H Attendance | AC-ATT-02 | FAIL | D2 |
| H Attendance | AC-ATT-03 | FAIL | D2 |
| H Attendance | AC-ATT-04 | FAIL | D2 |
| H Attendance | AC-ATT-05 | FAIL | D2 |
| H Attendance | AC-ATT-06 | FAIL | D2 |
| H Attendance | AC-ATT-07 | FAIL | D2 |
| H Attendance | AC-ATT-08 | FAIL | D2 |
| I Security | AC-SEC-01 | FAIL | D2 for approval audit; the rest passes |
| I Security | AC-SEC-02 | PASS | postgres has no `ports:`, sits on an internal network |
| I Security | AC-SEC-03 | PASS | no literal secrets; images copy no `.env` |
| I Security | AC-SEC-04 | PASS | mime, size and traversal checks enforced |
| I Security | AC-SEC-05 | FAIL | D4 — no operator can authenticate |
| J DevOps | AC-DEVOPS-01 | PASS | static; dynamic build BLOCKED (D9) |
| J DevOps | AC-DEVOPS-02 | PASS | static; dynamic build BLOCKED (D9) |
| J DevOps | AC-DEVOPS-03 | PASS | release.yml pushes both images to ghcr.io |
| J DevOps | AC-DEVOPS-04 | PASS | tag pinned to `sha-<40 hex>` and validated |
| J DevOps | AC-DEVOPS-05 | PASS | static wiring; live tunnel reachability BLOCKED (D9) |
| J DevOps | AC-DEVOPS-06 | PASS | `hosiana_network` declared `external: true` |
| J DevOps | AC-DEVOPS-07 | PASS | named volumes for postgres and proof storage |
| J DevOps | AC-DEVOPS-08 | PASS | all three services healthchecked, DB-gated startup |
| J DevOps | AC-DEVOPS-09 | PASS | rollback re-pins the tag via the verified deploy path |
| K Ops | AC-OPS-01 | FAIL | D2 |
| K Ops | AC-OPS-02 | FAIL | D2 |
| K Ops | AC-OPS-03 | PASS | session summary and per-ticket detail |
| K Ops | AC-OPS-04 | PASS | demand aggregated from frozen snapshots |
| K Ops | AC-OPS-05 | FAIL | D2 |
| K Ops | AC-OPS-06 | PASS | backup + restore scripts exist; rehearsal still owed |

## What genuinely works

Worth stating plainly, because it narrows the fix list:

- Quota reservation is genuinely concurrency safe. Ten parallel buyers against a
  quota of five produce exactly five orders and never oversell.
- The 30-minute deadline is stamped on both `expires_at` and `payment_deadline_at`.
- The expiration **sweeper** releases every reservation correctly.
- Payment rejection is atomic and correct: immediate CANCELLED, quota released,
  discount ledger released, no ticket issued, retry refused, audit written.
- `audit_logs` is genuinely append-only; both UPDATE and DELETE are rejected by
  trigger.
- Configuration is real configuration. Phase dates, prices, quotas, the discount
  value and the beverage and souvenir catalogs were all changed at runtime through
  the admin API and the change took effect immediately with no redeploy.
- The deploy artefacts are careful: no published database port, an internal data
  network, `hosiana_network` treated as pre-existing, immutable SHA image tags,
  health-gated rollout and a real rollback path.

## Suggested fix order

1. **D2** — one-line column fix; unblocks 18 criteria on its own.
2. **D1** — decides whether `unit_price` is gross or net; unblocks Early Bird.
3. **D5** — makes the 60-ticket Mupel bucket reachable.
4. **D4** — restore operator access.
5. **D7** — restores the deploy migration step.
6. **D3**, **D6** — correctness and exposure.
7. **D8** — wire `tests/` into CI so this cannot regress unnoticed.
8. **D9** — re-run the Docker checks from a host with a daemon.

Re-run the whole suite and re-evaluate this report after 1–5 land. Anything still
unverified stays BLOCKED.
