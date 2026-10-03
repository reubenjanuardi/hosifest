# 13 — Domain Model

## 1. Domain Modules

```text
Identity
Event
Sales
Eligibility
Catalog
Promotion
Order
Payment
Ticketing
Benefits
Souvenir
Attendance
Reporting
Audit
```

## 2. Core Domain Objects

### Event

Represents HOSIFEST event information.

### SalesPhase

Represents:
- code
- name
- date range
- visibility
- status

Examples:
- EARLY_BIRD
- PRESALE
- NORMAL

### TicketOffer

Represents a commercial offer:
- phase
- name
- price
- quota
- purchase limits
- channel
- eligibility rule
- included benefits

Examples:
- Early Bird
- Presale
- Normal

### Congregation

Represents configured Early Bird eligibility organization.

### DiscountCode

Represents conditional discount.

For Hosiana Early Bird:
- target offer
- max usage 35
- effective discount to Rp150.000
- active period

### Product / ProductOption

Generic commerce catalog.

### BeverageOption

Dynamic benefit/catalog choices for Presale.

### BenefitDefinition

Represents included entitlement of a ticket offer.

Example:

```text
Presale
├── Beverage × 1
└── Tumbler × 1
```

### Customer

Purchaser/contact.

### Order

Commercial transaction.

### OrderItem

Individual line in an order.

### Ticket

Admission entitlement created after payment verification.

### SouvenirCustomization

Exactly one per ticket.

### SouvenirOptionGroup

Configurable grouping of keychain choices.

### SouvenirOption

One selectable customization option.

### AttendanceSession

One ENTRY to EXIT cycle.

### Payment

Manual payment proof and review state.

### AuditLog

Immutable administrative action record.

## 3. Aggregate Boundaries

### Order Aggregate

```text
Order
├── OrderItem[]
├── Payment[]
└── Ticket[]
```

### Ticket Aggregate

```text
Ticket
├── Benefit selection
├── Souvenir customization
└── AttendanceSession[]
```

### Promotion Aggregate

```text
DiscountCode
└── Usage[]
```

## 4. Key Invariants

1. One ticket has exactly one souvenir customization after final confirmation.
2. One ticket receives one keychain.
3. One Presale ticket receives one beverage entitlement and one tumbler entitlement.
4. One order can contain multiple tickets.
5. Each ticket can have different selections.
6. Historical prices are snapshots.
7. Historical souvenir selections are snapshots.
8. Discount usage cannot exceed configured limit.
9. Ticket quota cannot become negative.
10. Payment rejection cannot leave the order payable.
11. Expired orders cannot issue tickets.
12. Only PAID orders can issue valid tickets.
13. One ticket cannot have two active attendance sessions.
14. Re-entry creates a new session after EXIT.
15. Admin changes that affect transaction behavior are auditable.

## 5. Recommended Service Boundaries Inside Monolith

```text
SalesService
  → phase/offer/eligibility validation

PromotionService
  → discount validation/reservation/release

OrderService
  → order creation and totals

Inventory/QuotaService
  → ticket quota reservation

PaymentService
  → payment proof and review

TicketService
  → ticket/QR issuance

BenefitService
  → Presale beverage/tumbler entitlement

SouvenirService
  → configuration and snapshot

AttendanceService
  → entry/exit

AuditService
  → audit logs
```

## 6. Important Data Flow

```text
SalesPhase
    ↓
TicketOffer
    ↓
Customer selects offer
    ↓
Eligibility + Promotion
    ↓
Per-ticket benefits/souvenir
    ↓
Order
    ↓
Payment
    ↓
Ticket
    ↓
Attendance
```

## 7. Configuration Principle

The following are domain configuration, not source-code constants:

- ticket prices
- ticket quotas
- sales dates
- purchase limits
- congregation list
- discount usage limits
- beverage options
- souvenir option groups/options
- benefit quantities
- OTS availability

Initial values may be seeded through migration/seed scripts and later managed by admin.
