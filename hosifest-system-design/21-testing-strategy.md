# 21 — Testing Strategy

## 1. Unit Tests

### Sales Phase
- phase active/inactive
- restricted visibility
- date boundaries

### Early Bird
- congregation must be configured
- Hosiana code required for discounted allocation
- invalid code rejected
- 35-ticket discount usage cap enforced
- non-Hosiana congregation cannot consume Hosiana allocation

### Pricing
- Early Bird base = Rp175.000
- Hosiana discount = Rp25.000
- effective price = Rp150.000
- Presale = Rp225.000
- Normal = Rp250.000

These are seed/configuration tests and must not assume the values are compile-time constants.

### Presale Benefits
- exactly one beverage entitlement per Presale ticket
- one tumbler entitlement
- beverage choice required
- dynamic beverage catalog accepted

### Souvenir
- customization required
- exactly one customization per ticket
- multiple tickets can have different selections
- invalid option/group combinations rejected
- no extra price

### Orders
- multiple tickets
- authoritative total
- 30-minute expiry
- expired order cannot pay
- rejected payment immediately cancels order

### Attendance
- valid entry
- duplicate entry
- valid exit
- duplicate exit
- exit then re-entry
- invalid ticket
- manual code lookup

## 2. Integration Tests

### Quota Race

Scenario:
- 1 ticket remains
- two concurrent purchase requests ask for 1 ticket

Expected:
- exactly one successful reservation
- other request receives quota failure
- quota never becomes negative

### Discount Race

Scenario:
- one discounted ticket remains under max 35
- two concurrent buyers use the code

Expected:
- exactly one consumes the remaining discounted allocation

### Payment Approval Idempotency

Send approval request twice.

Expected:
- one ticket issuance
- no duplicate tickets
- final order remains PAID

### Payment Rejection Atomicity

Reject payment.

Expected:
- order CANCELLED
- quota released
- discount usage released
- audit entry created

No partial commit.

## 3. E2E Tests

### Flow A — Early Bird Hosiana

```text
restricted access
→ select Hosiana
→ discount code
→ per-ticket souvenir
→ order
→ proof
→ approval
→ ticket
```

### Flow B — Early Bird Mupel

```text
select configured Mupel congregation
→ Early Bird
→ souvenir
→ payment
→ ticket
```

### Flow C — Presale

```text
Presale
→ beverage per ticket
→ souvenir per ticket
→ payment
→ ticket
```

### Flow D — Normal

```text
Normal
→ souvenir
→ payment
→ ticket
```

### Flow E — Re-entry

```text
ENTRY
→ EXIT
→ ENTRY
→ EXIT
```

## 4. Security Tests

- authentication bypass
- authorization bypass
- object-level authorization
- malformed file upload
- oversized payment proof
- XSS
- SQL injection
- rate limit
- QR token entropy/guessing
- secret scanning
- dependency scanning

## 5. Infrastructure Tests

- Docker build
- Docker Compose startup
- database persistence
- health endpoint
- readiness endpoint
- Cloudflare Tunnel routing
- rollback
- migration execution

## 6. Test Data

Seed development data should include:
- one HOSIFEST event
- three sales phases
- initial ticket offers and quotas
- 12 congregations
- Hosiana discount code placeholder/configurable secret
- two beverage options
- sample souvenir groups/options
- test admin users

Do not use real payment secrets.
