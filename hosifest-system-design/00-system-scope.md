# 00 — System Scope and Overall Architecture

## 1. Purpose

HOSIFEST Event Commerce & Ticketing System menangani seluruh lifecycle transaksi dan operasional event:

```text
Event information
    ↓
Ticket sales
    ↓
Souvenir / benefit customization
    ↓
Checkout
    ↓
Payment proof
    ↓
Payment verification
    ↓
Ticket issuance
    ↓
Venue entry / exit
    ↓
Operational reporting
```

## 2. Scope

### Public

- Event information
- Ticket catalog
- Restricted Early Bird access
- Presale benefit selection
- Cart
- Checkout
- Discount code
- Per-ticket souvenir customization
- Payment instructions
- Payment proof upload
- Order status
- E-ticket and QR

### Event Operations

- QR ENTRY
- QR EXIT
- Manual ticket search
- Attendance session tracking
- Souvenir fulfillment lookup
- Procurement/customization reports

### Administration

- Event management
- Sales phase management
- Ticket offer management
- Quota management
- Price management
- Product and beverage catalog
- Souvenir option catalog
- Discount codes
- Orders
- Payment verification
- Ticket management
- Attendance monitoring
- Reports
- User/role management
- Audit logs

## 3. Architectural Style

Use **modular monolith** backend.

```text
Backend
├── Auth & RBAC
├── Event
├── Sales Phase
├── Ticketing
├── Catalog
├── Promotion
├── Order
├── Payment
├── Souvenir
├── Attendance
├── Reporting
└── Audit
```

Microservices are out of scope for the current event.

## 4. Runtime Architecture

```text
Internet
   |
   v
Cloudflare
   |
   v
Existing Cloudflare Tunnel
   |
   v
hosiana_network
   |
   v
hosifest-frontend
   |
   | /api reverse proxy
   v
hosifest-backend
   |
   v
PostgreSQL
```

Public internet access should terminate at Cloudflare Tunnel. Backend and PostgreSQL remain private.

## 5. Deployment Principle

All app runtime artifacts are Docker images.

```text
GitHub
  ↓
GitHub Actions
  ↓
Tests
  ↓
Docker Build
  ↓
GHCR
  ↓
VPS
  ↓
Docker Compose
```

## 6. Core Design Principles

1. Backend is the source of truth.
2. Business configuration is data, not hardcoded source code.
3. Transactional operations use database transactions.
4. Quota reservation is concurrency-safe.
5. Historical order values are immutable snapshots.
6. Payment approval is idempotent.
7. QR token is unique and server-validated.
8. Every ENTRY/EXIT operation is auditable.
9. Sensitive admin changes are audited.
10. Secrets are not stored in images or Git.

## 7. Explicit Non-Goals

- Multi-tenant SaaS
- Microservices
- Native mobile application
- Full accounting system
- Offline-first synchronization
- General marketplace
