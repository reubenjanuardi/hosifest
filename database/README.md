# HOSIFEST — Database

PostgreSQL 16 schema for the HOSIFEST modular monolith.
Source of truth: `hosifest-system-design/15-database-schema.md` +
`14-final-erd.md` + `12-business-rules.md`.

## Layout

```text
database/   this README (documentation only)
migrations/ versioned DDL, applied in ascending filename order
seeders/    initial configuration rows, applied after migrations
```

## How to apply

### 1. Migrations

Execute every `migrations/*.sql` in ascending filename order, each inside its
own transaction. See `migrations/README.md` for the full contract.

```bash
# conceptual — the exact command belongs to the backend/deploy tooling
for f in $(ls migrations/*.sql | sort); do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f "$f"
done
```

Skip non-SQL files (`README.md`). Every object is guarded so a full re-run is a
no-op — that is what makes CI re-runs safe.

### 2. Seeders (development / testing only)

Execute every `seeders/*.sql` in ascending filename order, after migrations.
See `seeders/README.md` for the order table and the production warnings.

```bash
for f in $(ls seeders/*.sql | sort); do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f "$f"
done
```

**Never run `seeders/002_dev_users.sql` in production.**

### 3. PostgreSQL is private

Never publish port 5432. It must only be reachable from the backend on the
internal network (`19-docker-architecture.md` §3, `AGENTS.md` §1).

## Table inventory

### Identity

| Table             | Purpose |
| ----------------- | ------- |
| `users`           | Admin/staff accounts. `email` is unique case-insensitively. |
| `roles`           | `SUPER_ADMIN`, `ADMIN`, `FINANCE`, `CHECKIN`, `SOUVENIR`. |
| `permissions`     | Flat permission codes (`payment:review`, `attendance:write`, …). |
| `role_permissions`| Role → permission grants. |
| `user_roles`      | User → role assignment (many-to-many). |

### Event & configuration

| Table                  | Purpose |
| ---------------------- | ------- |
| `events`               | One row per event; `slug` is the public key (`hosifest`). |
| `sales_phases`         | `EARLY_BIRD` / `PRESALE` / `NORMAL`. Unique per `(event_id, code)`. |
| `congregations`        | Configurable Early Bird eligibility list. |
| `ticket_offers`        | Purchasable configuration: price, quota, limits, visibility, channel. |
| `offer_allocations`    | Per-offer quota/eligibility split (Hosiana vs Mupel, …). |
| `discount_codes`       | Promotion configuration: value + usage caps + eligibility. |
| `discount_usages`      | Transactional discount reservation/consumption ledger. |

### Catalogs

| Table                     | Purpose |
| ------------------------- | ------- |
| `products`                | Generic add-on merchandise. |
| `product_options`         | Variants of a product. |
| `beverage_options`        | Dynamic Presale beverage catalog. |
| `benefit_definitions`     | Entitlements included in an offer (Presale = beverage ×1 + tumbler ×1). |
| `souvenir_option_groups`  | Configurable customization groups. |
| `souvenir_options`         | Selectable options inside a group. |

### Transactions

| Table                      | Purpose |
| -------------------------- | ------- |
| `customers`                | Guest purchaser (name + phone required, email optional). |
| `orders`                   | Commercial transaction + state machine + payment deadline. |
| `order_items`              | Line items with **immutable** price/name snapshots. |
| `payments`                 | Manual payment proof and review. |
| `order_status_history`     | Append-only transition log. |
| `payment_proof_files`      | Storage keys for uploaded proofs (files live in object storage). |

### Ticketing & fulfilment

| Table                        | Purpose |
| ---------------------------- | ------- |
| `tickets`                    | Issued admission entitlement + price/name snapshots. |
| `ticket_benefit_selections`  | The customer's chosen benefit per ticket (view alias: `benefit_selections`). |
| `souvenir_customizations`    | Exactly one per ticket, with fulfilment status. |
| `souvenir_selections`        | Chosen souvenir options **with immutable snapshots**. |
| `attendance_sessions`        | ENTRY→EXIT cycles; re-entry creates a new session. |

### Governance

| Table                | Purpose |
| -------------------- | ------- |
| `audit_logs`         | Append-only audit trail; `UPDATE`/`DELETE` is blocked by trigger. |
| `hosifest_migration_version` | Bookkeeping written by the migration runner. |

### Read views (migration 009)

| View                        | Purpose |
| --------------------------- | ------- |
| `v_current_sales_phase`     | The phase active right now, per event. |
| `v_active_ticket_offers`    | Offers sellable by date + status. |
| `v_offer_capacity`          | Offer quota / reserved / sold / remaining. |
| `v_allocation_capacity`     | Same, per allocation. |
| `v_discount_usage_summary`  | Consumed / reserved / remaining per discount code. |
| `v_offer_benefit_definitions` | Entitlements per offer. |
| `v_ticket_attendance_state` | `OUTSIDE` / `INSIDE` per ticket. |
| `v_ticket_lookup`           | Ticket + order + customer for attendance search. |
| `benefit_selections`        | Alias view over `ticket_benefit_selections` (ERD naming). |

## Key invariants and where they are enforced

| # | Invariant | Enforced by |
| - | --------- | ----------- |
| 1 | `ticket_offers.sold_quantity + reserved_quantity <= quota` | `CHECK (ticket_offers_capacity_chk)` |
| 2 | `offer_allocations.sold_quantity + reserved_quantity <= quota` | `CHECK (offer_allocations_capacity_chk)` |
| 3 | Discount consumption never exceeds `max_total_usage` | `hosifest_reserve_discount_usage()` locks the code row `FOR UPDATE` and re-counts inside the transaction |
| 4 | One ticket ⇒ one souvenir customization | `UNIQUE (ticket_id)` on `souvenir_customizations` |
| 5 | A ticket has at most one **open** attendance session | `CREATE UNIQUE INDEX one_active_attendance_session ON attendance_sessions(ticket_id) WHERE exit_at IS NULL` |
| 6 | One approved payment per order (⇒ idempotent approval) | `CREATE UNIQUE INDEX one_approved_payment_per_order ON payments(order_id) WHERE status = 'APPROVED'` |
| 7 | One discounted unit per ticket | `CREATE UNIQUE INDEX discount_usages_one_per_ticket ON discount_usages(ticket_id) WHERE ticket_id IS NOT NULL` |
| 8 | One selection per (ticket, benefit definition) | `UNIQUE (ticket_id, benefit_definition_id)` |
| 9 | One proof file per payment marked current | partial unique index on `payment_proof_files` |
| 10 | `audit_logs` cannot be mutated | `BEFORE UPDATE OR DELETE` trigger raising `restrict_violation` |
| 11 | `total = subtotal − discount` on every order | `CHECK (orders_total_bound_chk)` |
| 12 | Phase code ∈ {EARLY_BIRD, PRESALE, NORMAL} | `CHECK (sales_phases_code_chk)` |
| 13 | Ticket / QR codes are unique | `UNIQUE (ticket_code)`, `UNIQUE (qr_token_hash)` |
| 14 | No negative money or quantities | `CHECK` on every amount/quantity column |
| 15 | `CONGREGATION_LIST` allocation must reference a congregation | `CHECK (offer_allocations_congregation_chk)` |
| 16 | `DISCOUNT_CODE` allocation must reference a discount code | `CHECK (offer_allocations_discount_chk)` |
| 17 | A `BEVERAGE` benefit selection must pick a beverage option | `CHECK (ticket_benefit_selections_beverage_chk)` |
| 18 | An exit scan must record who closed the session | `CHECK (attendance_sessions_exit_consistency_chk)` |

The database **protects invariants only**. It does not encode the workflow:
valid order transitions, price computation, phase resolution, eligibility and
payment approval decisions all belong to the backend domain layer.

## Indexes for the real query paths

| Table                 | Index |
| --------------------- | ----- |
| `orders`              | `order_number`, `(status, created_at DESC)`, `(customer_id, created_at DESC)`, `(event_id, status)`, partial `(expires_at) WHERE status IN (WAITING_PAYMENT, PAYMENT_REVIEW)` for the expiry sweeper |
| `tickets`             | `ticket_code`, `qr_token_hash`, `order_item_id`, `(ticket_offer_id, status)`, `(status, created_at DESC)` |
| `tickets`             | `UNIQUE (order_item_id, sequence_number)` — issuance idempotency |
| `attendance_sessions` | `(ticket_id, entry_at DESC)`, `(entry_scanned_by, entry_at DESC)`, `(exit_scanned_by, exit_at DESC)`, `(entry_at DESC, exit_at)`, `(event_id, entry_at DESC)`, plus `one_active_attendance_session` |
| `offer_allocations`   | `(ticket_offer_id)`, `(congregation_id)`, `(discount_code_id)` |
| `audit_logs`          | `(entity_type, entity_id, created_at DESC)`, `(actor_user_id, created_at DESC)`, `(action, created_at DESC)`, `(created_at DESC)` |
| `customers`           | `lower(email)`, `phone` |
| `payments`            | `(order_id, created_at DESC)`, `(status, created_at DESC)` |
| `discount_usages`     | `(discount_code_id, status)`, `(order_id)`, `(ticket_id)` |
| `congregations`       | `(active, display_order)` |
| `souvenir_customizations` | `(status, created_at DESC)` |

## How the backend consumes configuration (the "no hardcoding" rule)

Every business value below is a **row**, read at request time. None of them may
appear as a literal in backend or frontend code.

| Business value            | Where it lives | Read with |
| ------------------------- | -------------- | --------- |
| Phase list & boundaries   | `sales_phases` | `v_current_sales_phase` |
| Prices, quotas, limits, visibility | `ticket_offers` | `v_active_ticket_offers`, `v_offer_capacity` |
| Hosiana / Mupel split     | `offer_allocations` | `v_allocation_capacity` |
| Congregation list         | `congregations` | `WHERE active` ordered by `display_order` |
| Discount value & caps     | `discount_codes` | by `code`, joined to `eligible_ticket_offer_id` / `eligible_congregation_id` |
| Discount remaining        | `discount_usages` | `v_discount_usage_summary` |
| Beverage catalog          | `beverage_options` | `WHERE active` |
| Souvenir groups / options | `souvenir_option_groups` / `souvenir_options` | `WHERE active` |
| Presale entitlements      | `benefit_definitions` | `v_offer_benefit_definitions` |
| Payment window (30 min)   | backend config constant | **not** a DB row; read `orders.payment_deadline_at` |

Prices in IDR are stored as `BIGINT` rupiah with no decimals.

Snapshots are immutable by design: `orders`, `order_items`, `tickets`,
`souvenir_selections` and `ticket_benefit_selections` store what the customer
actually bought, so later admin edits to catalogs or prices never rewrite
history.

## Transaction patterns

Order creation (one transaction, row locks on capacity counters):

```sql
BEGIN;
  -- resolve phase/offer/allocation/discount in the domain layer
  SELECT hosifest_reserve_discount_usage(:code_id, :order_id, NULL, :qty);
  -- insert order, order_items
  SELECT hosifest_reserve_ticket_offer(:offer_id, :allocation_id, :qty, false);
COMMIT;
```

Payment approval (idempotent):

```sql
BEGIN;
  -- guard: only one APPROVED payment can exist (partial unique index)
  UPDATE payments SET status='APPROVED', reviewed_at=now(), reviewed_by=:uid
   WHERE id=:payment_id AND status='SUBMITTED';
  SELECT hosifest_reserve_ticket_offer(:offer_id, :allocation_id, :qty, true); -- reserve -> sold
  SELECT hosifest_consume_discount_usage(:order_id);
  UPDATE orders SET status='PAID', paid_at=now() WHERE id=:order_id AND status='PAYMENT_REVIEW';
  -- issue tickets; UNIQUE(order_item_id, sequence_number) prevents duplicates
  INSERT INTO audit_logs (...) VALUES (...);
COMMIT;
```

Expiry / rejection:

```sql
BEGIN;
  UPDATE orders SET status='EXPIRED', expired_at=now()
   WHERE id=:order_id AND status='WAITING_PAYMENT';
  SELECT hosifest_release_ticket_offer(:offer_id, :allocation_id, :qty);
  SELECT hosifest_release_discount_usage(:order_id);
  INSERT INTO audit_logs (...) VALUES (...);
COMMIT;
```

Attendance entry:

```sql
INSERT INTO attendance_sessions (ticket_id, event_id, entry_at, entry_scanned_by, scan_mode)
VALUES (:ticket_id, :event_id, now(), :uid, 'QR');
```

A second concurrent ENTRY for the same ticket violates
`one_active_attendance_session`, which is exactly the duplicate-entry guard the
API needs. EXIT updates the open session (`exit_at`, `exit_scanned_by`); re-entry
inserts a new session.

## Assumptions

See the root report. In short: discount counts per ticket; `orders.total_amount`
is kept consistent by CHECK; catalog tables not defined in `15-database-schema.md`
(`users`, `roles`, `products`, `product_options`, `benefit_definitions`) follow
`02-actors-roles-use-cases.md` and `04-data-model-erd.md`.
