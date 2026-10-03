# 23 — Acceptance Criteria

This document defines the minimum conditions before the implementation may be considered production-ready for HOSIFEST.

## A. Sales Configuration

### AC-SALES-01
Admin can configure sales phase dates without code changes.

### AC-SALES-02
Admin can configure ticket offer prices without code changes.

### AC-SALES-03
Admin can configure ticket quotas without code changes.

### AC-SALES-04
Initial seed configuration is:

```text
Early Bird total allocation: 95
  Hosiana discounted allocation: 35
  Mupel Jakarta Pusat allocation: 60

Presale: 55
Normal: 50
```

Total planned allocation: 200 tickets.

### AC-SALES-05
The system does not allow sales beyond configured allocation.

## B. Early Bird

### AC-EB-01
Early Bird is not exposed as an unrestricted public offer when configured as restricted.

### AC-EB-02
Customer selecting Early Bird must select an eligible configured congregation.

### AC-EB-03
The initial congregation seed contains the 12 specified GPIB Mupel Jakarta Pusat congregations.

### AC-EB-04
Hosiana discount requires the configured discount code.

### AC-EB-05
Hosiana discount can be used for no more than 35 tickets in total.

### AC-EB-06
Current seed pricing is:
- base Early Bird: Rp175.000
- Hosiana discount: Rp25.000
- effective Hosiana price: Rp150.000

### AC-EB-07
The business values remain configurable data and are not source-code constants.

## C. Presale

### AC-PS-01
Presale current seed price is Rp225.000.

### AC-PS-02
Each Presale ticket includes one beverage entitlement and one tumbler entitlement.

### AC-PS-03
Beverage selection is required per Presale ticket.

### AC-PS-04
Beverage options can be added/removed by admin without code deployment.

### AC-PS-05
Initial beverage seed includes Es Kopi Susu and Milk Tea.

## D. Souvenir

### AC-SOU-01
Every paid ticket has exactly one custom canvas keychain entitlement.

### AC-SOU-02
Souvenir customization is mandatory.

### AC-SOU-03
Each ticket in a multi-ticket order can have a different configuration.

### AC-SOU-04
Souvenir option groups and options are dynamic.

### AC-SOU-05
Customization does not add cost.

### AC-SOU-06
Historical selections remain unchanged after admin edits the catalog.

## E. Checkout

### AC-CHK-01
Customer can purchase multiple tickets in one order.

### AC-CHK-02
Server calculates final total.

### AC-CHK-03
Quota reservation is concurrency safe.

### AC-CHK-04
Order receives a 30-minute payment-proof deadline.

### AC-CHK-05
Expired order cannot submit payment proof.

### AC-CHK-06
Expired order releases ticket quota and discount reservation.

## F. Payment

### AC-PAY-01
Customer can submit QRIS or bank-transfer payment proof.

### AC-PAY-02
Authorized Finance/Admin can approve or reject proof.

### AC-PAY-03
Approval issues ticket(s) exactly once even when approval request is retried.

### AC-PAY-04
Rejected payment immediately changes order to CANCELLED.

### AC-PAY-05
Cancelled order releases reserved ticket quota.

### AC-PAY-06
Cancelled order releases reserved discount usage.

### AC-PAY-07
Cancelled order cannot be retried for payment; customer must create a new order.

## G. Ticket

### AC-TKT-01
Every issued ticket has a unique ticket code.

### AC-TKT-02
Every issued ticket has a unique opaque QR token.

### AC-TKT-03
Ticket QR does not expose sensitive personal data.

### AC-TKT-04
Historical ticket price and configuration remain immutable.

## H. Attendance

### AC-ATT-01
Authorized staff can scan entry.

### AC-ATT-02
Authorized staff can scan exit.

### AC-ATT-03
Manual search by ticket code is available.

### AC-ATT-04
A valid ticket can ENTRY, EXIT and ENTRY again.

### AC-ATT-05
Duplicate ENTRY while inside returns ALREADY_INSIDE and does not create a second active session.

### AC-ATT-06
Duplicate EXIT while outside returns ALREADY_OUTSIDE.

### AC-ATT-07
Invalid QR/ticket code does not change attendance state.

### AC-ATT-08
Attendance operations create auditable records.

## I. Audit & Security

### AC-SEC-01
Every sensitive admin mutation creates an audit record.

### AC-SEC-02
PostgreSQL is not publicly exposed.

### AC-SEC-03
Production secrets are not stored in Git or Docker images.

### AC-SEC-04
Payment proof upload is validated and stored durably.

### AC-SEC-05
Admin APIs enforce backend authorization.

## J. Docker & CI/CD

### AC-DEVOPS-01
Frontend production image is built by GitHub Actions.

### AC-DEVOPS-02
Backend production image is built by GitHub Actions.

### AC-DEVOPS-03
Images are pushed to GHCR.

### AC-DEVOPS-04
Production VPS deploys the immutable Git SHA image.

### AC-DEVOPS-05
Production application is reachable through the existing Cloudflare Tunnel.

### AC-DEVOPS-06
HOSIFEST deployment uses the existing Docker network `hosiana_network` as designed.

### AC-DEVOPS-07
PostgreSQL uses persistent storage.

### AC-DEVOPS-08
Deployment performs health/readiness verification.

### AC-DEVOPS-09
A previously known-good image can be rolled back.

## K. Operational Readiness

### AC-OPS-01
Sales report can show sold vs configured quota.

### AC-OPS-02
Payment report can show pending/submitted/paid/cancelled/expired.

### AC-OPS-03
Attendance report can show entry/exit sessions.

### AC-OPS-04
Souvenir report can aggregate paid-ticket customization demand.

### AC-OPS-05
Presale beverage demand can be aggregated.

### AC-OPS-06
Backup and restore procedure has been tested before event day.

## Release Gate

The system may be marked **Release Candidate** only when:
- critical automated tests pass
- Docker images build successfully
- production-like deployment succeeds
- health checks pass
- migration is verified
- backup restore is verified
- all critical acceptance criteria above pass

The system may be marked **Production Ready** only after an event-day rehearsal completes successfully.
