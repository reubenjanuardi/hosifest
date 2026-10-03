# 11 — Security and Operations

## Authentication

Admin operations require authenticated users.

Use role/permission authorization.

## Authorization

Do not authorize only by frontend route.

Backend checks permission on every protected operation.

## Payment Proof

Payment proof upload must enforce:
- allowed MIME types
- file size limit
- storage outside executable web root
- randomized/object identifiers
- authorization checks
- retention policy

## QR Security

QR contains a high-entropy opaque token.

Do not place sensitive customer information directly in QR payload.

Backend resolves token to ticket.

## Rate Limits

Apply rate limiting to:
- order creation
- payment proof submission
- ticket lookup
- login
- attendance scanning endpoints if exposed publicly

## Audit

Audit:
- price changes
- quota changes
- discount changes
- payment approval/rejection
- ticket void/correction
- attendance manual override
- souvenir catalog changes
- admin user/role changes

## Database

PostgreSQL must not be publicly reachable.

Use least-privilege database credentials.

## Backup

Run automated production backups.

At minimum define:
- backup frequency
- retention
- restore procedure
- restore verification

## Event-Day Operation

Before event:
- verify production deployment
- verify tunnel
- verify database connectivity
- test QR ENTRY
- test QR EXIT
- test manual lookup
- verify backup
- verify admin accounts
- verify payment review access
- verify report availability

During event:
- use dedicated ENTRY devices
- use dedicated EXIT devices
- monitor API/database health
- retain audit logs
- use manual lookup if scanner hardware has issues

After event:
- export attendance
- export sales
- export payment report
- export souvenir fulfillment report
- create backup
- archive operational data

## Incident Principle

Never fix production business data directly in PostgreSQL without an approved migration or audited administrative operation.

Prefer reversible, logged corrections.
