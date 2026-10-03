# 04 — Data Model and ERD Baseline

## Main Entities

```text
events
  └── sales_phases
        └── ticket_offers

congregations
  └── early_bird eligibility

customers
  └── orders
        ├── order_items
        │      └── tickets
        │            ├── ticket_benefits
        │            ├── souvenir_customizations
        │            └── attendance_sessions
        └── payments

products
  └── product_options / variants

beverage_options
  └── dynamic catalog

souvenir_option_groups
  └── souvenir_options

discount_codes
  └── discount_code_usages

users
  └── audit_logs
```

## Important Modeling Decisions

### Sales phase is separate from ticket offer

Do not use one flat ticket table to represent every business rule.

A phase defines sales timing and general behavior.

A ticket offer defines the purchasable commercial configuration.

### Early Bird eligibility

Use a configurable `congregations` table or equivalent configuration entity.

Do not hardcode the 12 church names into frontend source.

### Discount

Discount is a separate entity and usage is tracked transactionally.

The Hosiana 35-ticket limit should be a configurable usage limit on the specific discount code.

### Presale benefits

Presale's beverage and tumbler should be modeled as **included benefits/entitlements**, rather than simply as customer-added paid products.

### Souvenir

Customization belongs to ticket:

```text
ticket 1 → customization 1
ticket 2 → customization 2
```

### Attendance

Use `attendance_sessions` rather than a single check-in boolean.

### Historical snapshots

Orders preserve:
- price
- discount
- item description
- ticket configuration
- souvenir option snapshot
- benefit/selection snapshot

## Suggested Cardinality

```text
Event 1:N SalesPhase
SalesPhase 1:N TicketOffer

Customer 1:N Order
Order 1:N OrderItem
OrderItem 0..1 Ticket

Ticket 1:1 SouvenirCustomization
SouvenirCustomization 1:N SouvenirSelection

Ticket 1:N AttendanceSession

Order 1:N PaymentAttempt

DiscountCode 1:N DiscountCodeUsage
```

## Concurrency Requirement

Quota and discount limits must be updated transactionally.

Two concurrent buyers must not be able to exceed:
- ticket quota
- discount usage limit
