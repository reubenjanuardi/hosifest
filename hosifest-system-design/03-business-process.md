# 03 — Business Process

## 1. Ticket Sales

```text
Customer
  ↓
Select Phase
  ↓
Select Ticket Offer
  ↓
Eligibility Check
  ├── Early Bird → Congregation
  ├── Presale → Benefit selection
  └── Normal
  ↓
Per-ticket customization
  ↓
Checkout
  ↓
Server calculates total
  ↓
Reserve quota
  ↓
Create order
  ↓
30 minute payment window
```

## 2. Early Bird

```text
Early Bird
  ↓
Select Congregation
  ↓
One of configured Mupel congregations
  ↓
If Hosiana:
    require valid dedicated discount code
    max 35 discounted tickets
  ↓
Otherwise:
    normal Early Bird price Rp175.000
```

The system should treat the discount allocation as a ticket-level usage limit.

## 3. Presale

```text
Presale
  ↓
Rp225.000
  ↓
1 beverage entitlement
  ↓
1 tumbler entitlement
  ↓
Beverage selected from dynamic catalog
```

## 4. Payment

```text
WAITING_PAYMENT
       |
       | proof before 30 min
       v
PAYMENT_REVIEW
   |           |
   | approve   | reject
   v           v
 PAID       CANCELLED
                |
                v
          Release reservation
```

Expiration:

```text
WAITING_PAYMENT + 30 min
          ↓
       EXPIRED
          ↓
Release reservation
```

## 5. Ticket Issuance

```text
PAID
 ↓
Create ticket
 ↓
Generate unique QR token
 ↓
Issue e-ticket
```

No valid ticket may be issued from EXPIRED or CANCELLED orders.

## 6. Attendance

```text
ENTRY scan
   ↓
No active session?
   ├── yes → create session
   └── no → ALREADY_INSIDE

EXIT scan
   ↓
Active session?
   ├── yes → set exit_at
   └── no → ALREADY_OUTSIDE

ENTRY after EXIT
   ↓
Create new session
```

## 7. Souvenir Fulfillment

```text
Paid Tickets
   ↓
Frozen customization
   ↓
Aggregate options
   ↓
Production report
   ↓
Keychain production
   ↓
READY
   ↓
HANDED_OVER
```
