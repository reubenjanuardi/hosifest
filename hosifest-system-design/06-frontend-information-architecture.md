# 06 — Frontend Information Architecture

## Public Website

```text
Home
├── Event
├── Tickets
│   ├── Early Bird (restricted)
│   ├── Presale
│   └── Normal
├── Benefits
├── FAQ
└── Contact
```

## Early Bird UX

Early Bird should have restricted visibility.

Recommended:
- not promoted as a generic public offer
- accessible through a direct/private URL or controlled entry
- requires eligibility selection

Flow:

```text
Early Bird Access
      ↓
Select Congregation
      ↓
If Hosiana:
  Enter discount code
      ↓
Select quantity
      ↓
Customize each ticket
```

The 12 congregation names should come from API configuration.

## Presale UX

For every Presale ticket:

```text
Ticket #1
  Choose beverage
  Configure souvenir

Ticket #2
  Choose beverage
  Configure souvenir
```

Beverage list comes from API.

## Normal UX

```text
Select quantity
   ↓
Configure souvenir for each ticket
   ↓
Checkout
```

## Checkout

Show:
- customer data
- each ticket
- congregation/eligibility where relevant
- beverage where relevant
- souvenir configuration
- discount
- total
- 30-minute deadline

## Order Status

Recommended:

```text
WAITING PAYMENT
PAYMENT REVIEW
PAID
EXPIRED
CANCELLED
```

## E-ticket

Show:
- event
- ticket type
- ticket code
- QR
- relevant holder/purchaser data
- ticket status

## Admin IA

```text
Dashboard
├── Sales
├── Orders
├── Payments
├── Tickets
├── Attendance
├── Sales Phases
├── Ticket Offers
├── Congregations
├── Beverages
├── Products
├── Souvenir
│   ├── Option Groups
│   ├── Options
│   └── Fulfillment
├── Discounts
├── Reports
├── Users
└── Audit Logs
```

## Check-in UI

Provide two explicit modes:

```text
ENTRY MODE
EXIT MODE
```

Staff may switch mode.

Manual lookup must be available as fallback.
