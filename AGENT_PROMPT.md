# HOSIFEST Coding Agent Prompt

Implement HOSIFEST using `hosifest-system-design/00-system-scope.md` through `13-domain-model.md`.

First:
1. Read all documents.
2. Inspect existing repository/infrastructure.
3. Produce a gap analysis.
4. Propose implementation sequence.
5. Do not invent business rules.

Critical business facts:
- Early Bird base Rp175.000.
- Hosiana Early Bird effective Rp150.000 via configured discount, max 35 tickets.
- Mupel Jakarta Pusat Early Bird 60 tickets at Rp175.000.
- Presale Rp225.000, includes one dynamic beverage selection and one tumbler.
- Normal Rp250.000.
- Initial planned total 200 tickets.
- All quotas and prices are configurable.
- Beverage options are dynamic.
- Souvenir options are dynamic.
- One custom canvas keychain per ticket; customization mandatory and per-ticket.
- Payment is QRIS/bank transfer with manual proof.
- 30-minute proof deadline.
- Rejected payment immediately cancels order and releases reservations.
- QR supports ENTRY and EXIT; re-entry is allowed.
- Existing public ingress is Cloudflare Tunnel through `hosiana_network`.

Build vertically:
Foundation → Identity → Sales/Ticketing → Catalog/Benefits → Souvenir → Checkout → Payment → Ticket → Attendance → Reporting → Production.

At each phase run tests, migrations and Docker build validation.
