# 08 — Development Roadmap

## Phase 0 — Repository and Infrastructure Foundation

- repository setup
- frontend/backend structure
- PostgreSQL
- local Docker Compose
- environment handling
- lint/test
- GitHub Actions CI

## Phase 1 — Identity and Admin

- authentication
- RBAC
- admin shell
- audit logging

## Phase 2 — Event and Sales Configuration

- event
- sales phases
- ticket offers
- configurable quota
- configurable pricing
- configurable visibility
- congregation catalog
- discount codes

## Phase 3 — Product and Benefit Catalog

- dynamic beverage catalog
- tumbler entitlement
- general product catalog
- dynamic souvenir groups/options

## Phase 4 — Checkout

- guest checkout
- multi-ticket order
- per-ticket eligibility
- per-ticket beverage
- per-ticket souvenir
- quota reservation
- discount reservation
- 30-minute expiry

## Phase 5 — Payment

- QRIS/bank instructions
- payment proof
- finance review
- approval
- rejection → immediate cancellation
- release reservations

## Phase 6 — Ticketing

- issue ticket
- QR generation
- e-ticket
- ticket lookup

## Phase 7 — Attendance

- ENTRY mode
- EXIT mode
- QR scanning
- manual search
- re-entry sessions
- duplicate handling
- attendance report

## Phase 8 — Souvenir Fulfillment

- customization lock
- per-ticket view
- aggregate production report
- fulfillment statuses

## Phase 9 — Reports

- sales
- revenue
- ticket
- payment
- attendance
- beverage demand
- souvenir demand
- discount usage

## Phase 10 — Production

- Docker production compose
- GHCR
- GitHub Actions CD
- VPS deployment
- Cloudflare Tunnel
- health checks
- backups
- rollback drill
- event-day readiness test

## Delivery Strategy

Implement vertically:

```text
Foundation
 ↓
Ticket purchase happy path
 ↓
Payment
 ↓
Ticket
 ↓
Attendance
 ↓
Reporting
```

Avoid building every admin screen before the customer transaction flow works end-to-end.
