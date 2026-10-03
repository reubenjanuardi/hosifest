# 01 — Functional and Non-Functional Requirements

## Functional Requirements

### FR-01 Event

System stores and displays event name, description, schedule, venue, rundown, movie information, FAQ and contact.

### FR-02 Sales Phase

Admin can configure:
- name
- code
- start/end
- visibility
- eligibility
- quota
- status

Required phases:
- EARLY_BIRD
- PRESALE
- NORMAL

### FR-03 Ticket Offer

Admin configures:
- ticket name
- sales phase
- price
- quota
- purchase limit
- visibility
- channel
- eligibility
- active period

Current configured business values:

| Phase | Price | Planned Quota | Notes |
|---|---:|---:|---|
| Early Bird Hosiana | Rp150.000 effective | 35 | Base Rp175.000 with dedicated discount code |
| Early Bird Mupel JakPus | Rp175.000 | 60 | Restricted to listed Mupel congregations |
| Presale | Rp225.000 | 55 | Includes beverage selection + tumbler |
| Normal | Rp250.000 | 50 | Normal/OTS phase |

Total planned tickets: **200**.

The database must store all values as configuration. Do not hardcode these numbers.

### FR-04 Early Bird Eligibility

For Early Bird, customer selects congregation origin.

Allowed Mupel Jakarta Pusat list:

1. GPIB "Paulus" Jakarta Pusat
2. GPIB "Anugerah" Jakarta Pusat
3. GPIB "Bethesda" Jakarta Pusat
4. GPIB "Betlehem" Jakarta Pusat
5. GPIB "Bukit Zaitun" Jakarta Pusat
6. GPIB "Ebenhaezer" Jakarta Pusat
7. GPIB "Hosiana" Jakarta Pusat
8. GPIB "Immanuel" Jakarta Pusat
9. GPIB "Maranatha" Jakarta Pusat
10. GPIB "Gideon" Jakarta Pusat
11. GPIB "Petrus" Jakarta Pusat
12. GPIB "Pniel" Jakarta Pusat

The list must be configurable in database/admin and must not be hardcoded in frontend code.

### FR-05 Hosiana Discount

Hosiana Early Bird uses a dedicated discount code.

- Effective price: Rp150.000
- Usage quota: 35 tickets
- Discount usage is counted per ticket, not per order
- Code must only be valid for the relevant Early Bird offer
- The actual code value is configured by admin

### FR-06 Cart / Checkout

One order may contain multiple tickets and additional products where applicable.

Each ticket must support its own:
- eligibility data
- souvenir customization
- Presale beverage selection if applicable

### FR-07 Guest Checkout

No customer account required for MVP.

Minimum customer information:
- name
- email
- WhatsApp/phone

### FR-08 Reservation

Checkout reserves ticket quota for a limited time.

All quota updates must be transaction-safe.

### FR-09 Payment

Methods:
- QRIS
- Bank transfer

MVP uses manual proof submission and admin/finance verification.

### FR-10 Payment Expiration

Customer has 30 minutes from order creation to submit payment proof.

When deadline is reached:
- order becomes EXPIRED
- ticket reservation is released
- coupon reservation is released

### FR-11 Payment Rejection

When payment proof is rejected:
- order becomes CANCELLED immediately
- reserved ticket quota is released
- discount usage reservation is released
- customer must create a new order for another attempt

No payment retry is permitted inside the same order.

### FR-12 Ticket Issuance

Ticket is issued only after payment is verified.

Ticket includes:
- ticket code
- QR token
- ticket type
- price snapshot
- purchaser/holder information

### FR-13 Souvenir

Every ticket includes one custom canvas keychain.

Customization is mandatory.

### FR-14 Beverage Benefit

Presale ticket includes:
- one beverage
- one tumbler

Beverage options come from a dynamic catalog and are not hardcoded.

### FR-15 Attendance

Staff can:
- scan QR for ENTRY
- scan QR for EXIT
- search by ticket code
- manually execute operation if authorized

Re-entry is allowed. Every entry and exit must be scanned.

### FR-16 Reporting

System provides:
- ticket sales report
- revenue report
- payment status report
- attendance report
- souvenir customization aggregation
- beverage demand report
- discount usage report

### FR-17 Audit

Sensitive changes must create audit log.

## Non-Functional Requirements

### NFR-01 Security

- HTTPS through Cloudflare
- secure authentication
- RBAC
- server-side validation
- upload restrictions
- rate limiting on public-sensitive endpoints
- secrets externalized
- PostgreSQL private

### NFR-02 Reliability

Critical transaction operations use database transactions and idempotency.

### NFR-03 Deployment

Application services are deployed only through Docker images built by GitHub Actions.

### NFR-04 Observability

Provide:
- health endpoint
- structured logs
- container health checks
- deployment logs

### NFR-05 Maintainability

Business values are configurable.

### NFR-06 Performance

System should handle event-day concurrent ticket validation and normal sales traffic without relying on client-side state.

### NFR-07 Backup

Production PostgreSQL must have automated backup and a documented restore procedure.
