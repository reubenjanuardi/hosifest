# HOSIFEST Agent Handoff

Read `hosifest-system-design/README.md` first, then all documents `00` through `13`.

Treat `12-business-rules.md` as the final business-rule source of truth.

Before coding:
1. Inspect repository and current infrastructure.
2. Inspect existing Docker configuration.
3. Inspect existing `hosiana_network`.
4. Inspect existing Cloudflare Tunnel.
5. Produce gap analysis.
6. Identify only genuinely blocking unknowns.

Non-negotiable:
- modular monolith
- PostgreSQL
- Docker image based deployment
- GitHub Actions CI/CD
- GHCR
- VPS deployment
- Cloudflare Tunnel
- `hosiana_network`
- no public PostgreSQL
- configurable quotas/prices/catalogs
- three phases
- 200 initial planned tickets
- per-ticket souvenir
- dynamic beverage catalog
- manual payment proof
- 30-minute payment proof window
- payment rejection immediately cancels order
- QR ENTRY and EXIT
- re-entry supported
- audit sensitive changes

Do not hardcode values marked configurable.

Do not perform destructive production changes without approval.
