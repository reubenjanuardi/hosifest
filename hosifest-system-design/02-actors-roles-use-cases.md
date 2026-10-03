# 02 — Actors, Roles and Use Cases

## Actors

### Customer

- Browse event
- Select ticket
- Enter congregation origin for Early Bird
- Apply discount code
- Customize souvenir per ticket
- Select Presale beverage per ticket
- Checkout
- Upload payment proof
- View order
- View e-ticket

### Check-in Staff

- Scan QR ENTRY
- Scan QR EXIT
- Search ticket code
- View ticket status
- Perform authorized manual attendance action

### Sales/Admin

- Configure ticket phases
- Configure ticket prices
- Configure quotas
- Configure promotion
- View orders
- View ticket sales

### Finance/Admin

- View payment proof
- Approve payment
- Reject payment
- View financial reports

### Souvenir/Admin

- Manage souvenir option groups
- Manage options
- View per-ticket customization
- Generate production/procurement reports

### Super Admin

- All administrative functions
- User and role management
- Audit log
- System configuration

## Permission Principles

```text
ADMIN
  ticket:write
  catalog:write
  promotion:write
  report:read

FINANCE
  payment:read
  payment:review
  report:read

CHECKIN
  attendance:read
  attendance:write

SOUVENIR
  souvenir:read
  souvenir:write
  report:read

SUPER_ADMIN
  *
```

## Key Use Cases

### UC-01 Buy Early Bird

Customer selects Early Bird → selects congregation → supplies Hosiana code when applicable → configures souvenir → checkout → payment → verification → ticket.

### UC-02 Buy Presale

Customer selects Presale → chooses beverage per ticket → receives tumbler entitlement → configures souvenir per ticket → checkout.

### UC-03 Buy Normal

Customer selects Normal → configures souvenir per ticket → checkout → payment.

### UC-04 Payment Rejected

Payment proof rejected → order immediately CANCELLED → quota and discount usage released.

### UC-05 Entry

Staff scans QR → backend validates → active session created.

### UC-06 Exit

Staff scans QR → backend finds active session → exit recorded.

### UC-07 Re-entry

After exit, a new ENTRY scan creates a new attendance session.

### UC-08 Souvenir Fulfillment

Admin views paid ticket customization → aggregate demand → produce keychains → mark fulfillment status.
