# HOSIFEST Backend

Fastify modular monolith. TypeScript, raw `pg` (no ORM), Zod validation, Vitest.
Base path `/api/v1`. All responses use the envelope `{ data, meta, error }`.

## Business rule enforcement

The backend is authoritative for price, quota, discount, eligibility,
entitlement, payment, ticket issuance, attendance and souvenir validity.
**No price, quota, phase date, catalog entry, congregation, purchase limit or
discount code is hardcoded.** Every such value is read from configuration
tables at request time.

The single constant in `src/config/env.ts` is
`PAYMENT_PROOF_WINDOW_MINUTES = 30`, which `12-business-rules.md` BR-PAY-03
states as a fixed rule rather than a configurable value.

## Commands

```bash
pnpm install
pnpm dev          # watch mode
pnpm build        # tsc -> dist/
pnpm start        # node dist/server.js
pnpm migrate      # applies every migrations/*.sql in ascending order
pnpm typecheck
pnpm test              # unit only; integration tests auto-skip without a DB

# Integration tests need a real PostgreSQL with migrations + seeders applied:
$env:TEST_DATABASE_URL = "postgresql://user:pass@localhost:5432/hosifest"
pnpm test -- tests/integration
```

## Modules

| Module      | Responsibility |
|-------------|----------------|
| identity    | JWT auth, RBAC (ADMIN/FINANCE/ATTENDANCE), permissions |
| event       | Public event + sales-phase + offer + catalog reads |
| sales       | Phase/offer/allocation resolution, purchase limits, congregation eligibility |
| promotion   | Discount validation, capacity check, reserve/consume/release |
| catalog     | Beverages, souvenir groups/options, benefit entitlements |
| order       | Order creation, authoritative totals, quota reservation, 30-min expiry |
| payment     | Proof submission, finance approve/reject |
| ticketing   | Ticket issuance, QR tokens, e-ticket lookup |
| souvenir    | Customization + fulfilment state machine |
| attendance  | Entry/exit sessions, re-entry, search |
| reporting   | Sales/tickets/payments/attendance/souvenir/beverage/discount reports |
| audit       | Immutable audit log for sensitive admin changes |

## Concurrency safety

### Quota and discount reservation

`POST /orders` runs in a single transaction:

1. Resolve and validate the offers and allocations involved.
2. Lock every `ticket_offers` and `offer_allocations` row in a deterministic
   UUID order (`src/db/locks.ts`) so concurrent checkouts queue instead of
   racing, and cannot deadlock by acquiring the same rows in a different order.
3. For the discount code, take `SELECT ... FROM discount_codes ... FOR UPDATE`
   before summing `discount_code_usages`, so the read-check-reserve sequence is
   atomic.
4. Apply quota movement with a **guarded UPDATE** (`src/db/quota.ts`):

```sql
UPDATE ticket_offers
   SET reserved_quantity = reserved_quantity + $2,
       sold_quantity      = sold_quantity + $3
 WHERE id = $1
   AND reserved_quantity + $2 >= 0
   AND sold_quantity      + $3 >= 0
   AND sold_quantity + reserved_quantity + $2 + $3 <= quota
RETURNING id
```

If the update affects zero rows the request exceeded the configured quota and
`QUOTA_EXHAUSTED` is raised. The invariant `sold + reserved <= quota` is
therefore enforced by the database itself, not by application-level
read-then-write logic. The same guard is applied to `offer_allocations`, with
the offer-level change rolled back if the allocation-level guard rejects.

### Idempotent payment approval

`POST /admin/orders/:id/approve-payment` is protected by two independent
guards inside one transaction:

1. **Conditional status transition.** After `SELECT ... FROM orders ... FOR UPDATE`,
   approval runs
   `UPDATE orders SET status='PAID' WHERE id=$1 AND status='PAYMENT_REVIEW'`.
   `rowCount === 0` means the order was already processed, so the call returns
   the current state and issues nothing. The row lock makes two concurrent
   approvals mutually exclusive; exactly one observes `PAYMENT_REVIEW`.
2. **Issuance guard.** `TicketService.issueForOrder` returns existing tickets
   instead of inserting when any ticket already exists for the order, so even a
   crash between the status update and the insert cannot duplicate tickets on
   retry.

Rejection moves the order to `CANCELLED`, releases the reserved quota and the
discount reservation, and writes an audit row. `CANCELLED` is terminal, so
there is no retry path.

### Attendance

ENTRY takes a row lock on the ticket and refuses to insert when an active
session exists (`ALREADY_INSIDE`); EXIT closes the active session or reports
`ALREADY_OUTSIDE`. Invalid tickets raise `INVALID_TICKET` before any write, so
attendance state is unchanged. The partial unique index
`one_active_attendance_session` is the final database-level guarantee that a
ticket has at most one active session. Re-entry works because EXIT closes the
session, freeing the partial index slot.

## QR tokens

`qr_token_hash` stores a SHA-256 digest of a 32-byte random opaque token. The
raw token is returned only in the issuance response and is never recoverable
from the database. No personal data is embedded in the token.

## Contract issues

- `docs/database-agent-bugs.md` - reproduced defects in `migrations/` and
  `seeders/` that currently prevent the schema from applying at all.
- `docs/backend-contract-issues.md` - open questions for Root, plus the
  deviations this backend made from `15-database-schema.md` to match the
  real migrations.

