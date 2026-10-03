# 12 — Final Business Rules Specification

## 1. Ticketing

### BR-TKT-01 — Sales Phases

There are exactly three operational sales phases:

```text
EARLY_BIRD
PRESALE
NORMAL
```

Underlying commercial categories:

```text
1. HTM GPIB Hosiana Jakarta
2. HTM GPIB Mupel JakPus
3. HTM Presale + Beverage Tumbler
4. HTM Normal/OTS
```

The three-phase model is the application-level sales model.

### BR-TKT-02 — Current Ticket Pricing

| Offer | Price | Planned Quota | Notes |
|---|---:|---:|---|
| Early Bird Hosiana | Rp150.000 effective | 35 | Base Early Bird Rp175.000 with dedicated discount |
| Early Bird Mupel JakPus | Rp175.000 | 60 | Restricted to configured Mupel congregations |
| Presale | Rp225.000 | 55 | Includes beverage + tumbler |
| Normal / OTS | Rp250.000 | 50 | Normal phase |

Planned total:

```text
95 + 55 + 50 = 200 tickets
```

### BR-TKT-03 — Configurability

Quota and prices must be database/admin configuration.

Do not hardcode:
- 35
- 60
- 55
- 50
- prices

The current values are initial seed/configuration.

### BR-TKT-04 — Early Bird Visibility

Early Bird is restricted and is not intended to be broadly promoted as a public offer.

The system should support restricted visibility/direct access.

### BR-TKT-05 — Early Bird Congregation

Every Early Bird ticket must capture a configured congregation.

Initial list:

```text
GPIB "Paulus" Jakarta Pusat
GPIB "Anugerah" Jakarta Pusat
GPIB "Bethesda" Jakarta Pusat
GPIB "Betlehem" Jakarta Pusat
GPIB "Bukit Zaitun" Jakarta Pusat
GPIB "Ebenhaezer" Jakarta Pusat
GPIB "Hosiana" Jakarta Pusat
GPIB "Immanuel" Jakarta Pusat
GPIB "Maranatha" Jakarta Pusat
GPIB "Gideon" Jakarta Pusat
GPIB "Petrus" Jakarta Pusat
GPIB "Pniel" Jakarta Pusat
```

List is configurable and must not be hardcoded.

### BR-TKT-06 — Hosiana Early Bird Discount

If Early Bird origin is GPIB Hosiana:
- dedicated discount code required
- effective price becomes Rp150.000
- maximum 35 discounted tickets
- usage counted per ticket
- actual code value is configured by admin

The code must not work on non-Hosiana Early Bird offers.

### BR-TKT-07 — Multiple Tickets

Customer may buy multiple tickets.

A single order may contain multiple tickets.

### BR-TKT-08 — Per-ticket Data

Eligibility, benefit selection and souvenir customization are modeled per ticket.

This avoids ambiguity when one order contains multiple tickets.

### BR-TKT-09 — Cancellation

Customer cannot cancel a valid purchased ticket.

Payment rejection is not customer cancellation; it is an order state transition before ticket issuance.

Administrative void/correction is separate and audited.

### BR-TKT-10 — Transfer

Ticket may be transferred by sharing/handing over its valid QR.

No complex identity transfer workflow is required for MVP.

### BR-TKT-11 — Price Snapshot

Historical order prices do not change when admin changes current prices.

## 2. Payment

### BR-PAY-01 — Methods

MVP:
- QRIS
- Bank Transfer

### BR-PAY-02 — Proof Workflow

Customer submits payment proof.

Admin/Finance verifies manually.

No payment webhook is required for MVP.

### BR-PAY-03 — Payment Window

Customer has 30 minutes to submit payment proof.

### BR-PAY-04 — Expiration

If proof is not submitted within 30 minutes:

```text
ORDER → EXPIRED
```

and reservations are released.

### BR-PAY-05 — Rejection

If payment proof is rejected:

```text
ORDER → CANCELLED
```

immediately.

Then:
- release ticket reservation
- release discount reservation

Customer must create a new order.

### BR-PAY-06 — Verification

Only authorized Finance/Admin can approve/reject payment.

### BR-PAY-07 — Idempotency

Payment approval must be idempotent.

Repeated approval cannot issue duplicate tickets.

## 3. Presale Benefits

### BR-BEN-01

Presale ticket price is Rp225.000.

### BR-BEN-02

Each Presale ticket includes:
- 1 beverage
- 1 tumbler

### BR-BEN-03

Beverage choice is mandatory for Presale.

### BR-BEN-04

Beverage catalog is dynamic.

Initial seed:
- Es Kopi Susu
- Milk Tea

Future choices must be addable through configuration.

## 4. Souvenir

### BR-SOU-01

Every ticket receives exactly 1 custom canvas keychain.

### BR-SOU-02

Customization is mandatory.

### BR-SOU-03

Customization belongs to the ticket.

### BR-SOU-04

Different tickets in one order may have different configurations.

### BR-SOU-05

Customization does not add cost.

### BR-SOU-06

Charm/accessory types are dynamic and must not be hardcoded.

### BR-SOU-07

No customer-facing stock reservation is needed for charm inventory in MVP because keychains/materials are prepared by order demand.

### BR-SOU-08

Paid customization is frozen by snapshot.

### BR-SOU-09

Admin correction after payment requires special permission and audit log.

## 5. Attendance

### BR-ATT-01

The same ticket QR is used for ENTRY and EXIT.

### BR-ATT-02

Every venue entry must be scanned.

### BR-ATT-03

Every venue exit must be scanned.

### BR-ATT-04

Re-entry is allowed.

### BR-ATT-05

Attendance is modeled as sessions:

```text
ENTRY → active session → EXIT
```

After EXIT, another ENTRY may start a new session.

### BR-ATT-06

Authorized committee staff can scan.

### BR-ATT-07

Manual ticket-code lookup is allowed.

### BR-ATT-08

Invalid ticket:
- reject
- do not change attendance state
- log attempt

### BR-ATT-09

Already inside:
- return `ALREADY_INSIDE`
- do not create another active session

### BR-ATT-10

Already outside:
- return `ALREADY_OUTSIDE`
- do not create an exit

## 6. Administration

### BR-ADM-01

Authorized admin can modify prices.

### BR-ADM-02

Authorized admin can modify quotas.

### BR-ADM-03

Authorized admin can modify dynamic catalog data.

### BR-ADM-04

Historical transactions are immutable.

### BR-ADM-05

Sensitive changes are audited.

## 7. State Machines

### Order

```text
WAITING_PAYMENT
     |
     +---- payment proof ----> PAYMENT_REVIEW
     |                            |
     |                            +---- approve ----> PAID
     |                            |
     |                            +---- reject -----> CANCELLED
     |
     +---- 30 min expired ------> EXPIRED
```

No `PAYMENT_REJECTED → WAITING_PAYMENT` retry.

### Attendance

```text
OUTSIDE
  ↓ ENTRY
INSIDE
  ↓ EXIT
OUTSIDE
```

### Souvenir

```text
DRAFT
  ↓
CONFIRMED
  ↓
IN_PRODUCTION
  ↓
READY
  ↓
HANDED_OVER
```

## 8. Implementation Rule

Business rules must live in the backend/domain layer.

The frontend only presents available options and validation guidance.

Backend remains authoritative for:
- price
- quota
- discount
- eligibility
- benefit entitlement
- payment
- ticket issuance
- attendance
- souvenir validity
