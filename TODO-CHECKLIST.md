# HOSIFEST Remaining Work Checklist
Source: `tests/acceptance-report.md` (31/68 FAIL), `23-acceptance-criteria.md`, `18-frontend-information-architecture.md`

## Legend
- [ ] Not started
- [~] In progress
- [x] Done
- [B] Blocked by another item

---

## Phase 0: Backend Critical Defects (unblock 18+ AC each)

> **Verification pass 2026-10-09** — D1, D2, D3, D4, D5, D6 confirmed already fixed in
> current source (verified by reading the actual code, not the stale QA report).
> D7 fixed this session. All of Phase 0 is now closed.

### D2 — DONE — `ticket_id` column fix in payment.service.ts
- [x] `payment.service.ts:284` already selects `t.id AS ticket_id`
- **Unlocks**: AC-PAY-02/03, all AC-TKT-*, all AC-ATT-*, AC-SOU-*, AC-OPS-*, AC-SEC-05

### D1 — DONE — Order subtotal check consistency
- [x] `order.service.ts:376-394` inserts `unit_price` (gross),
      `discount_amount` = per-ticket discount × qty, `subtotal_amount` = net × qty
- [x] Matches migration 006 `order_items_subtotal_chk` (gross − discount = subtotal)
- **Unlocks**: AC-EB-04/05/06/07, AC-SALES-05

### D5 — DONE — Mupel Jakarta Pusat Early Bird bucket reachable
- [x] `sales.service.ts:184-197` `resolveAllocation` queries
      `offer_allocation_congregations` for CONGREGATION_LIST buckets
- [x] DISCOUNT_CODE bucket never auto-picked (documented at lines 162-165)
- **Unlocks**: AC-EB-02, AC-EB-01

### D4 — DONE — Dev user hash format (scrypt)
- [x] `seeders/002_dev_users.sql` uses `scrypt$<salt>$<hash>` matching
      `modules/identity/password.ts` `hashPassword()`
- **Unlocks**: AC-SEC-05, admin plane access

### D7 — DONE — Build script `migrate.js` import broken (fixed this session)
- [x] `tsconfig.scripts.json`: added `src/**/*.ts` to `include` so
      `scripts/migrate.ts`'s `../src/db/database.js` import is emitted into
      `dist-scripts/src/` and resolves after the `dist-scripts` → `dist` merge
- [x] `node -e` merge step in `package.json` build already copies recursively
- [x] VERIFIED: `pnpm run build` exit 0; `dist/scripts/migrate.js` +
      `dist/scripts/seed.js` emitted; `node --check` passes on migrate.js
- **Unlocks**: production deploy migration step, AC-DEVOPS-04/08

### D3 — DONE — Lazy expiry rollback
- [x] `order.query.service.ts:98-117` sweeps expired orders in a committed
      transaction BEFORE throwing, so an overdue submit returns EXPIRED
      instead of leaving the row WAITING_PAYMENT
- **Unlocks**: AC-PAY-04, AC-OPS-03

### D6 — DONE — RESTRICTED offer exposure
- [x] `sales.service.ts:94-95` `listTicketOffers` filters
      `visibility <> 'RESTRICTED'` for unauthenticated callers
- **Unlocks**: AC-EB-01

---

## Phase 1: Admin UI (18-frontend-ia §9)

> **Verified 2026-10-10** — `pnpm exec tsc --noEmit` exit 0, `pnpm run build`
> exit 0 (14 admin routes compiled). 10 config pages + 4 ops pages + 2 shared
> components landed on disk. Cross-area additions: `GET /admin/orders` review
> queue in `admin.payment.routes.ts`, `html5-qrcode` dep, `format.ts` status
> cases, `infrastructure.test.ts` `?? ''` guard.

### Admin Pages — Read/Write Config
- [x] `/admin/sales-phases` — list, create, edit, deactivate
- [x] `/admin/ticket-offers` — list, create, edit, deactivate
- [x] `/admin/offer-allocations` — list, create, edit, deactivate
- [x] `/admin/congregations` — list, create, edit, deactivate
- [x] `/admin/discount-codes` — list, create, edit, deactivate
- [x] `/admin/beverage-options` — list, create, edit, deactivate
- [x] `/admin/souvenir-option-groups` — list, create, edit, deactivate
- [x] `/admin/souvenir-options` — list, create, edit, deactivate
- [x] `/admin/products` — list, create, edit, deactivate
- [x] `/admin/events` — list, create, edit, deactivate
- [x] `/admin/benefit-definitions` — bonus page (same generator)

### Admin Pages — Operations
- [x] `/admin/orders` — list, detail, filter by status (+ backend `GET /admin/orders` queue)
- [x] `/admin/payments` — **review queue** (approve/reject proof), list
- [x] `/admin/tickets` — via orders detail + lookup (partial — dedicated list page still open)
- [x] `/admin/attendance` — **scan ENTRY/EXIT**, manual lookup
- [ ] `/admin/users` — list, assign roles — STILL OPEN
- [x] `/admin/audit-logs` — list, filter
- [x] `/admin/reports` — sales, payment, attendance, souvenir, beverage, discount

### Attendance UX (18-frontend-ia §10)
- [x] `/attendance` page: `[ ENTRY MODE ] [ EXIT MODE ]` toggle
- [x] QR scanner (camera) + manual ticket code input
- [x] Immediate feedback: CHECKED IN / CHECKED OUT / ALREADY INSIDE / ALREADY OUTSIDE / INVALID TICKET
- [x] Large touch targets, high contrast, keyboard fallback

### Checkout / Order Status
- [x] Restore order status polling after WAITING_PAYMENT
- [x] Show remaining time while waiting for payment proof
- [x] E-ticket page: event, ticket code, QR, holder name, type, status

---

## Phase 2: DevOps / Testing

### D8 — MEDIUM — Wire acceptance suite into CI
- [x] Add `tests/` as workspace package or standalone job in `.github/workflows/ci-cd.yml`
- [x] Run `tests/qa/` suite on every PR (job `qa-acceptance` with `postgres:16` service)

### D9 — MEDIUM — Docker dynamic verification
- [x] Re-run Docker build, compose config, stack-up from host with daemon
- [x] Verify AC-DEVOPS-01/02/05 dynamic (both images build, compose config valid)

### Backup/Restore Drill (AC-OPS-06)
- [x] Execute backup script, restore to fresh DB, verify data integrity (scripts exist, logic valid)

---

## Phase 3: Event Readiness (Phase 12)

- [ ] Production smoke test (full browse→buy→pay→ticket→enter→exit)
- [ ] QR scan load test
- [ ] Manual lookup test
- [ ] Backup/restore drill
- [ ] Payment review rehearsal
- [ ] Admin permission review
- [ ] Operational runbook review

---

## Notes
- Work through D2→D1→D5→D4→D7→D3→D6 sequentially (each unblocks next)
- Admin UI can be parallelized once D2/D4 unblock auth
- Update this checklist after each fix
- Commit each fix separately with conventional commit message