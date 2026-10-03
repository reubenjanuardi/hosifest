# 18 — Frontend Information Architecture and UX Contract

## 1. Public Navigation

```text
Home
Event
Tickets
Benefits
FAQ
Contact
```

## 2. Ticket Page

Three phase sections:

```text
Early Bird
Presale
Normal
```

Only offers whose visibility and availability rules allow public display are shown.

Early Bird should support controlled/private access and not be positioned as a broadly public offer.

## 3. Early Bird Flow

```text
Early Bird Entry
  ↓
Select congregation
  ↓
Select quantity
  ↓
For each ticket
  └── customize souvenir
  ↓
Hosiana users enter discount code
  ↓
Checkout
```

Display the configured congregation list from API.

Do not put the list in static frontend source.

## 4. Presale Flow

```text
Select Presale
  ↓
Quantity
  ↓
Ticket #1
  ├── beverage
  └── souvenir

Ticket #2
  ├── beverage
  └── souvenir

...
  ↓
Checkout
```

Beverage options come from API.

## 5. Normal Flow

```text
Select quantity
  ↓
Customize souvenir per ticket
  ↓
Checkout
```

## 6. Checkout

Sections:

1. Customer information
2. Ticket breakdown
3. Eligibility/congregation
4. Presale benefits
5. Souvenir customization
6. Discount
7. Total
8. Payment instructions

Every ticket must be visually separable.

Example:

```text
Ticket #1
  Type: Presale
  Beverage: Es Kopi Susu
  Keychain: Star + R

Ticket #2
  Type: Presale
  Beverage: Milk Tea
  Keychain: Heart + A
```

## 7. Order Status

Show:

```text
WAITING_PAYMENT
PAYMENT_SUBMITTED
PAID
EXPIRED
CANCELLED
```

Show remaining time while waiting for payment proof.

## 8. E-ticket

Each ticket page must contain:
- event
- ticket code
- QR code
- holder name snapshot
- ticket type
- status

Do not expose QR token as ordinary text.

## 9. Admin UX

```text
Dashboard
Sales Phases
Ticket Offers
Offer Allocations
Congregations
Orders
Payments
Tickets
Attendance
Beverage Options
Souvenir
Discount Codes
Products
Reports
Users
Audit Logs
```

## 10. Attendance UX

Dedicated controls:

```text
[ ENTRY MODE ] [ EXIT MODE ]
```

Input:
- QR scanner
- manual ticket code

Feedback should be immediate and unambiguous:

```text
CHECKED IN
CHECKED OUT
ALREADY INSIDE
ALREADY OUTSIDE
INVALID TICKET
```

## 11. Accessibility and Resilience

- keyboard navigation where practical
- large touch targets for event-day scanning
- high-contrast status messages
- avoid color-only status communication
- scanner fallback to manual code entry
