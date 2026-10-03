# 22 — Development Roadmap

## Phase 0 — Repository Reconnaissance

Deliverables:
- repository map
- framework/runtime confirmation
- existing Docker inspection
- existing `hosiana_network` inspection
- Cloudflare Tunnel routing inspection
- environment inventory
- gap analysis

**Do not change production yet.**

## Phase 1 — Application Foundation

- frontend
- backend
- PostgreSQL
- migrations
- environment configuration
- logging
- health endpoints
- Docker local development

Exit criteria:
- local stack starts with one command
- migration succeeds
- frontend can call backend

## Phase 2 — Identity & RBAC

- admin authentication
- roles/permissions
- protected routes
- audit infrastructure

Exit criteria:
- every admin endpoint is role protected

## Phase 3 — Event/Sales Configuration

- event CRUD
- sales phase CRUD
- ticket offer CRUD
- allocation CRUD
- configurable quota/price
- congregation CRUD
- discount code CRUD

Exit criteria:
- no ticket pricing/quota is hardcoded
- initial seed configuration produces the agreed current business setup

## Phase 4 — Catalog & Benefits

- beverage catalog
- Presale benefit rules
- product catalog
- souvenir option groups
- souvenir options

Exit criteria:
- admin can add a beverage without code change
- admin can add souvenir option without code change

## Phase 5 — Checkout

- public ticket selection
- Early Bird eligibility
- discount application
- multiple tickets
- per-ticket benefits
- per-ticket souvenir
- server-side totals
- quota reservation
- discount reservation
- 30-minute expiration

Exit criteria:
- one end-to-end order works without manual DB changes

## Phase 6 — Payment

- QRIS/bank instructions
- proof upload
- finance review
- approve
- reject
- release reservation
- audit

Exit criteria:
- payment rejection ends order
- approval issues tickets exactly once

## Phase 7 — Ticketing

- QR generation
- ticket code
- e-ticket
- ticket lookup

Exit criteria:
- paid order has valid unique ticket(s)

## Phase 8 — Attendance

- scanner
- manual lookup
- ENTRY
- EXIT
- re-entry
- duplicate handling

Exit criteria:
- event-day entry/exit flow works with dedicated test devices

## Phase 9 — Souvenir Fulfillment

- customization view
- frozen selections
- aggregate demand report
- fulfillment statuses

Exit criteria:
- production team can generate required souvenir quantities from paid tickets

## Phase 10 — Reporting

- sales
- revenue
- payment
- attendance
- beverage
- souvenir
- discount usage

## Phase 11 — Production Infrastructure

- production Compose
- GHCR
- GitHub Actions
- VPS deploy
- Cloudflare Tunnel
- health checks
- backups
- rollback

## Phase 12 — Event Readiness

- production smoke test
- QR scan load test
- manual lookup test
- backup/restore drill
- payment review rehearsal
- admin permission review
- operational runbook review

## Delivery Principle

Prioritize a complete vertical slice over isolated feature completion.

```text
Browse
→ Buy
→ Pay
→ Ticket
→ Enter
→ Exit
```

Then expand reporting and administrative depth.
