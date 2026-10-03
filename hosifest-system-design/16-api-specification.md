# 16 — API Specification

Base path:

```text
/api/v1
```

## 1. Response Envelope

Recommended:

```json
{
  "data": {},
  "meta": {},
  "error": null
}
```

Errors:

```json
{
  "data": null,
  "meta": {},
  "error": {
    "code": "QUOTA_EXHAUSTED",
    "message": "Ticket quota is no longer available.",
    "details": {}
  }
}
```

## 2. Public APIs

### Event

```http
GET /events/:slug
GET /events/:slug/sales-phases
GET /events/:slug/ticket-offers
GET /events/:slug/congregations
GET /events/:slug/beverage-options
GET /events/:slug/souvenir-option-groups
```

### Order

```http
POST /orders
GET /orders/:orderNumber
POST /orders/:orderNumber/payment-proof
```

### Ticket

```http
GET /tickets/:ticketCode
```

## 3. Create Order

`POST /orders`

The backend accepts a desired transaction and validates every rule.

Conceptual payload:

```json
{
  "eventSlug": "hosifest",
  "customer": {
    "name": "Reuben",
    "email": "reuben@example.com",
    "phone": "08xxxxxxxxxx"
  },
  "items": [
    {
      "ticketOfferId": "uuid",
      "quantity": 2,
      "tickets": [
        {
          "congregationId": "uuid",
          "discountCode": "configured-code",
          "beverageOptionId": "uuid",
          "souvenirSelections": [
            {
              "optionGroupId": "uuid",
              "optionId": "uuid",
              "quantity": 1
            }
          ]
        },
        {
          "congregationId": "uuid",
          "souvenirSelections": [
            {
              "optionGroupId": "uuid",
              "optionId": "uuid",
              "quantity": 1
            }
          ]
        }
      ]
    }
  ]
}
```

Backend responsibilities:

1. Resolve active sales phase.
2. Validate ticket offer.
3. Validate offer allocation.
4. Validate congregation if Early Bird.
5. Validate discount if supplied.
6. Validate discount usage capacity.
7. Validate Presale beverage entitlement.
8. Validate souvenir rules.
9. Calculate authoritative total.
10. Atomically reserve quota.
11. Atomically reserve discount usage.
12. Create order.
13. Set `expires_at = created_at + 30 minutes`.

## 4. Payment Proof

`POST /orders/:orderNumber/payment-proof`

Expected fields:
- method
- amount
- proof file

The endpoint must reject:
- expired order
- cancelled order
- already paid order

## 5. Admin Payment

```http
POST /admin/orders/:id/approve-payment
POST /admin/orders/:id/reject-payment
```

Approval must be idempotent.

Rejection:

```text
PAYMENT_SUBMITTED
      ↓
CANCELLED
      ↓
release quota
release discount reservation
```

No retry is allowed on the same order.

## 6. Attendance

```http
GET /admin/check-in/search?q=HOS-XXXX
POST /admin/check-in/entry
POST /admin/check-in/exit
```

Entry request:

```json
{
  "ticketCode": "HOS-XXXX"
}
```

or:

```json
{
  "qrToken": "opaque-token"
}
```

Successful entry:

```json
{
  "status": "CHECKED_IN",
  "sessionId": "uuid"
}
```

Successful exit:

```json
{
  "status": "CHECKED_OUT",
  "sessionId": "uuid"
}
```

## 7. Admin Configuration

```http
CRUD /admin/events
CRUD /admin/sales-phases
CRUD /admin/ticket-offers
CRUD /admin/offer-allocations
CRUD /admin/congregations
CRUD /admin/discount-codes
CRUD /admin/beverage-options
CRUD /admin/products
CRUD /admin/souvenir-option-groups
CRUD /admin/souvenir-options
```

## 8. Reports

```http
GET /admin/reports/sales
GET /admin/reports/tickets
GET /admin/reports/payments
GET /admin/reports/attendance
GET /admin/reports/souvenir
GET /admin/reports/beverage
GET /admin/reports/discounts
```

## 9. Security Requirements

- protected endpoints require authentication
- admin endpoints require permission checks
- public endpoints have rate limits where appropriate
- payment proof uploads use server-generated storage keys
- object-level authorization must be enforced
- never expose internal database IDs unnecessarily when public codes can be used
