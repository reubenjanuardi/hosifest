# 05 — REST API Specification

Base path:

```text
/api/v1
```

## Public Event

```http
GET /events/:slug
GET /events/:slug/sales-phases
GET /events/:slug/ticket-offers
GET /events/:slug/congregations
GET /events/:slug/beverage-options
GET /events/:slug/souvenir-options
```

The APIs expose only configuration currently available to the customer.

## Order

```http
POST /orders
GET /orders/:orderNumber
POST /orders/:orderNumber/payment-proof
```

### Create Order Request

Conceptual payload:

```json
{
  "customer": {
    "name": "Customer",
    "email": "customer@example.com",
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
          "beverageOptionId": "uuid",
          "souvenirSelections": []
        }
      ]
    }
  ]
}
```

For non-applicable fields, backend determines whether omission is valid.

## Server-side Validation

On `POST /orders`, backend validates:

- sales phase active
- offer active
- offer visibility/eligibility
- congregation validity for Early Bird
- Hosiana discount eligibility
- discount usage limit
- ticket quota
- purchase limit
- Presale beverage selection
- mandatory souvenir customization
- souvenir option validity
- order total

Client total must never be trusted.

## Payment

```http
POST /orders/:orderNumber/payment-proof
```

Payment proof contains:
- method
- amount
- proof reference
- submitted timestamp

## Admin Payment

```http
POST /admin/orders/:id/approve-payment
POST /admin/orders/:id/reject-payment
```

Reject request:

```json
{
  "reason": "Payment amount tidak sesuai"
}
```

Expected result:

```text
Order → CANCELLED
Reservation → RELEASED
Discount reservation → RELEASED
```

No retry on the same order.

## Attendance

```http
GET  /admin/check-in/search?q=HOS-XXXX
POST /admin/check-in/entry
POST /admin/check-in/exit
```

Entry/exit endpoint accepts either:
- QR token
- ticket code

## Admin Configuration

```http
CRUD /admin/sales-phases
CRUD /admin/ticket-offers
CRUD /admin/congregations
CRUD /admin/beverage-options
CRUD /admin/souvenir-option-groups
CRUD /admin/souvenir-options
CRUD /admin/discount-codes
CRUD /admin/products
```

All mutations require RBAC and audit logging.

## Error Codes

Recommended:

```text
INVALID_TICKET
TICKET_NOT_FOUND
PAYMENT_NOT_VERIFIED
TICKET_VOIDED
ALREADY_INSIDE
ALREADY_OUTSIDE
SALES_PHASE_CLOSED
QUOTA_EXHAUSTED
DISCOUNT_INVALID
DISCOUNT_LIMIT_REACHED
ELIGIBILITY_INVALID
SOUVENIR_INCOMPLETE
BEVERAGE_SELECTION_REQUIRED
ORDER_EXPIRED
ORDER_CANCELLED
```
