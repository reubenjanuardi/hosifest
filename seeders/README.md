# HOSIFEST — Seeders

Seed data for **development / testing** per `21-testing-strategy.md` §6 and
`23-acceptance-criteria.md`.

Seeders are plain SQL files applied in **ascending filename order**, after all
migrations have been applied.

## Apply order

| File                              | Contents |
| --------------------------------- | -------- |
| `001_roles_permissions.sql`        | roles + permissions + role_permissions |
| `002_dev_users.sql`                | dev-only users (super admin, finance, check-in, souvenir) + role assignment |
| `003_event_and_sales_phases.sql`  | the `hosifest` event + the three sales phases |
| `004_congregations.sql`           | the 12 Mupel Jakarta Pusat congregations |
| `005_ticket_offers.sql`           | 3 ticket offers + 4 offer allocations |
| `006_discount_codes.sql`          | the Hosiana Early Bird discount code + allocation backfill |
| `007_catalogs.sql`                | beverage options, souvenir groups/options, benefit definitions, sample products |

Apply them in exactly that order: `005` must run before `006` (the allocation
backfill needs the offer rows), and `006` must run before any order is created.

## Rules

- **Idempotent.** Every insert is `ON CONFLICT … DO NOTHING`. Re-running the
  folder on an already-seeded database changes nothing.
- **Deterministic ids.** Rows use fixed UUIDs so the files can reference each
  other without sub-selects.
- **No business logic.** Nothing here decides prices, eligibility or limits;
  it only supplies the initial configuration rows an admin would otherwise type.
- **No real secrets.** See the warnings below.

## !! Production warnings !!

Two seeded items are placeholders and **must** be changed before production:

1. **Discount code value** — `HOSIFEST_DEV_HOSIANA`
   (row `88888888-8888-4888-8888-888888888801`).
   Change it through the admin interface (`PUT /admin/discount-codes/:id`).
   The `max_total_usage = 35` cap and the Rp25.000 value are configuration and
   may stay as-is unless the event changes.

2. **Dev users** — `002_dev_users.sql` creates four accounts with well-known
   passwords:

   | Email                     | Password          | Role       |
   | ------------------------- | ----------------- | ---------- |
   | `admin@hosifest.test`     | `DevAdmin!2024`    | SUPER_ADMIN |
   | `finance@hosifest.test`   | `DevFinance!2024`  | FINANCE     |
   | `checkin@hosifest.test`   | `DevCheckin!2024`  | CHECKIN     |
   | `souvenir@hosifest.test`  | `DevSouvenir!2024` | SOUVENIR    |

   Do **not** load `002_dev_users.sql` in production, or delete these users and
   rotate the hashes before the deploy. Passwords are bcrypt (cost 10).

Also `003_event_and_sales_phases.sql` seeds placeholder dates, venue text and
phase boundaries. Admin must set the real values before going live.

## What the seeded configuration produces

| Item                     | Seeded value |
| ------------------------ | ------------ |
| Event                    | `HOSIFEST`, slug `hosifest` |
| Sales phases             | `EARLY_BIRD`, `PRESALE`, `NORMAL` |
| Early Bird base price    | Rp175.000, quota 95, restricted |
| Early Bird Hosiana alloc | quota 35, requires discount code |
| Early Bird Mupel alloc   | quota 60, requires configured congregation |
| Presale                  | Rp225.000, quota 55, beverage + tumbler |
| Normal / OTS             | Rp250.000, quota 50 |
| Planned total            | 200 |
| Hosiana discount         | Rp25.000 fixed, max 35 tickets, Early Bird only |
| Congregations            | 12 (Mupel Jakarta Pusat) |
| Beverages                | `ES_KOPI_SUSU`, `MILK_TEA` |
| Souvenir groups          | `CHARM`, `BASE`, `RIBBON` (10 options total) |
