# HOSIFEST Engineering Rules

This file is the authoritative engineering contract for every agent working on this
repository. Read it before any change. It is scoped to the whole repository tree.

## 0. Source of Truth

Business rules live in `hosifest-system-design/`. Precedence order:

1. `hosifest-system-design/12-business-rules.md` — final business rules
2. `hosifest-system-design/13-domain-model.md` — derived domain model
3. `hosifest-system-design/14-final-erd.md`, `15-database-schema.md`
4. `hosifest-system-design/16-api-specification.md`, `17-sequence-diagrams.md`
5. `hosifest-system-design/18-frontend-information-architecture.md`
6. `hosifest-system-design/19-docker-architecture.md`, `20-ci-cd-pipeline.md`
7. `hosifest-system-design/21-testing-strategy.md`
8. `hosifest-system-design/22-development-roadmap.md`
9. `hosifest-system-design/23-acceptance-criteria.md` — final release gate

`23-acceptance-criteria.md` is the final release gate.

## 1. Architecture (non-negotiable)

- Modular monolith
- PostgreSQL
- Docker-first, image-based deployment
- GitHub Actions CI/CD
- GHCR for production images
- VPS deployment
- Existing Cloudflare Tunnel for public ingress
- Existing external Docker network: `hosiana_network`
- PostgreSQL must never be exposed publicly

Never invent an alternative architecture. If a requirement is genuinely blocking,
stop and report it as an assumption/conflict instead of designing around it.

## 2. Business Facts (do NOT invent; do NOT change)

Three sales phases, applied at application level:

```text
EARLY_BIRD
PRESALE
NORMAL
```

Initial configuration values — these are SEED values, not constants:

| Offer                        | Price (effective) | Initial quota |
| ---------------------------- | ----------------- | ------------- |
| Early Bird — GPIB Hosiana    | Rp150.000         | 35            |
| Early Bird — Mupel JakPus    | Rp175.000         | 60            |
| Early Bird total             | —                 | 95            |
| Presale                      | Rp225.000         | 55            |
| Normal / OTS                 | Rp250.000         | 50            |
| Planned total                | —                 | 200           |

- Early Bird base price is Rp175.000.
- Hosiana Early Bird requires a dedicated discount code, effective Rp150.000, max 35 tickets.
- The discount code must NOT work on non-Hosiana Early Bird offers.
- Mupel JakPus Early Bird is restricted to configured congregations (dynamic list).
- Presale includes exactly one beverage and one tumbler per ticket.
- Presale beverage choice is mandatory; beverage catalog is dynamic.
- Every ticket gets exactly one custom canvas keychain; customization is mandatory and per-ticket.
- Souvenir charm/accessory catalog is dynamic.
- Payment is QRIS or bank transfer with manually verified proof.
- Payment proof deadline is 30 minutes.
- Proof not submitted in time => order `EXPIRED`, reservations released.
- Payment rejected => order `CANCELLED` immediately, reservations released.
- Payment approval is idempotent; repeat approval must never issue duplicate tickets.
- Historical order prices/snapshots never change when admin edits current config.
- One ticket QR serves both ENTRY and EXIT; re-entry is allowed; every movement is scanned.

State machines (from `12-business-rules.md`):

```text
Order:      WAITING_PAYMENT -> PAYMENT_REVIEW -> PAID
                              \-> CANCELLED
            WAITING_PAYMENT --(30 min)--> EXPIRED
Attendance: OUTSIDE <-> INSIDE  (ENTRY / EXIT sessions)
Souvenir:   DRAFT -> CONFIRMED -> IN_PRODUCTION -> READY -> HANDED_OVER
```

## 3. Configurability Rule (critical)

The numbers above are initial seed configuration. They MUST live in the database and be
editable via admin interfaces. Do NOT hardcode in source:

- ticket quotas
- ticket prices
- sales phase boundaries and dates
- beverage choices
- souvenir options and charm types
- Mupel congregation list
- purchase limits
- discount codes and their usage limits

Seed data must load values through configuration rows, not through literals embedded in
application logic. Business rules belong in the backend/domain layer, never in the frontend.

## 4. Engineering Rules

- Backend is authoritative for price, quota, discount, eligibility, entitlement,
  payment, ticket issuance, attendance and souvenir validity.
- Never trust frontend-computed totals; always recompute server-side.
- Use database transactions for quota reservation and discount reservation.
- Preserve historical snapshots (prices, benefits, customization, catalogs).
- Payment approval must be idempotent.
- Audit all sensitive admin changes (prices, quotas, catalogs, approvals, corrections).
- Every schema change requires a migration.
- Historical transactions are immutable.
- Never commit secrets. Use environment variables / secret stores.
- Do not perform destructive production changes without explicit approval.
- Do not perform destructive database changes without an approved migration and backup.

## 5. Multi-Agent File Ownership (strict)

Ownership is exclusive. Do not write files owned by another role.

| Role     | Owns                                              |
| -------- | ------------------------------------------------- |
| ROOT     | architecture, integration, shared docs, conflicts, release |
| DATABASE | `database/`, `migrations/`, `seeders/`             |
| BACKEND  | `apps/backend/`                                   |
| FRONTEND | `apps/frontend/`                                  |
| DEVOPS   | `deploy/`, `.github/workflows/`, Docker-related files |
| QA       | `tests/`                                          |

Shared / ROOT-reserved paths that require Root coordination before edit:

- `AGENTS.md`
- `.codex/`
- `docs/` and `hosifest-system-design/`
- repository root files (`docker-compose*.yml`, `README.md`, `package.json`, lockfiles)

Rules:

- Inspect before modifying.
- Never revert, overwrite or delete another agent's work.
- Do not edit another agent's owned area unless explicitly coordinated by Root.
- A role needing a change outside its area must report it to Root, not do it.
- Cross-area contract changes go through Root: database <-> backend API contracts,
  backend <-> frontend payloads, backend <-> deploy environment variables.
- Report files changed, assumptions, conflicts and open questions.
- Run relevant tests before reporting completion.
- Do not spawn nested agents unless instructed by Root.

## 6. Planned Repository Shape

```text
hosifest/
├── AGENTS.md
├── .codex/
│   ├── config.toml
│   └── agents/{database,backend,frontend,devops,qa}.toml
├── apps/{frontend,backend}/
├── database/
├── tests/
├── deploy/
├── .github/workflows/
└── hosifest-system-design/
```
