# 17 — Sequence Diagrams and State Machines

## 1. Early Bird Purchase

```mermaid
sequenceDiagram
    participant C as Customer
    participant F as Frontend
    participant B as Backend
    participant DB as PostgreSQL

    C->>F: Select Early Bird
    F->>B: Get configuration
    B-->>F: Offers + congregation list
    C->>F: Select congregation + quantity
    C->>F: Enter discount code if Hosiana
    F->>B: POST /orders
    B->>DB: Validate allocation + discount
    B->>DB: Reserve quota in transaction
    B->>DB: Reserve discount usage if applicable
    B->>DB: Create order
    DB-->>B: Commit
    B-->>F: Order + 30-minute deadline
```

## 2. Presale Purchase

```text
Presale Rp225.000
    ↓
Ticket quantity
    ↓
For each ticket:
  ├── choose beverage
  └── customize souvenir
    ↓
Server validation
    ↓
Create order
```

## 3. Payment Approval

```mermaid
sequenceDiagram
    participant C as Customer
    participant B as Backend
    participant A as Finance/Admin
    participant DB as PostgreSQL

    C->>B: Submit payment proof
    B->>DB: Store payment proof
    B-->>C: PAYMENT_SUBMITTED

    A->>B: Approve payment
    B->>DB: Transaction + lock order
    B->>DB: Mark payment PAID
    B->>DB: Issue tickets
    B->>DB: Confirm discount usage
    B->>DB: Confirm reserved quota as sold
    DB-->>B: Commit
    B-->>A: Success
```

## 4. Payment Rejection

```mermaid
sequenceDiagram
    participant A as Finance/Admin
    participant B as Backend
    participant DB as PostgreSQL

    A->>B: Reject payment
    B->>DB: Lock order
    B->>DB: Mark CANCELLED
    B->>DB: Release quota
    B->>DB: Release discount reservation
    B->>DB: Audit rejection
    DB-->>B: Commit
    B-->>A: CANCELLED
```

## 5. Expiration

```text
Scheduler/Worker
      ↓
find WAITING_PAYMENT orders with expires_at <= now
      ↓
transaction
  ├── lock order
  ├── verify still unpaid
  ├── EXPIRED
  ├── release quota
  └── release discount reservation
      ↓
commit
```

## 6. Attendance

```mermaid
stateDiagram-v2
    [*] --> OUTSIDE
    OUTSIDE --> INSIDE: ENTRY scan
    INSIDE --> OUTSIDE: EXIT scan
    OUTSIDE --> INSIDE: ENTRY re-entry
```

No active session:

```text
ENTRY → create attendance session
```

Active session:

```text
ENTRY → ALREADY_INSIDE
```

No active session on exit:

```text
EXIT → ALREADY_OUTSIDE
```

## 7. Order State

```text
WAITING_PAYMENT
   ├── payment proof → PAYMENT_SUBMITTED
   ├── 30 minutes → EXPIRED
   └── administrative cancellation if explicitly permitted

PAYMENT_SUBMITTED
   ├── approve → PAID
   └── reject → CANCELLED

EXPIRED → terminal
CANCELLED → terminal
PAID → ticket issuance
```

## 8. Ticket State

```text
PENDING_ISSUANCE
      ↓
ISSUED
      ↓
VALID
```

Any void/correction is an explicit administrative operation.

## 9. Souvenir State

```text
DRAFT
  ↓ payment approved
CONFIRMED
  ↓
IN_PRODUCTION
  ↓
READY
  ↓
HANDED_OVER
```
