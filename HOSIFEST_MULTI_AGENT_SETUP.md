# HOSIFEST Multi-Agent Setup

## Goal

Use one Root Agent to coordinate four parallel workers:

```text
ROOT
├── DATABASE
├── BACKEND
├── FRONTEND
└── DEVOPS
     ↓
    QA
```

Keep delegation shallow. Wave 1 handles independent work; Wave 2 runs QA/integration.

## Step 1 — Start Codex from the repository

```bash
cd /path/to/hosifest
codex
```

On Windows + WSL:

```bash
cd /mnt/c/path/to/hosifest
codex
```

Check:

```bash
codex --version
codex doctor --summary
```

## Step 2 — Give the Root Agent this prompt

```text
You are the ROOT AGENT for HOSIFEST.

Your first task is to configure this repository for multi-agent development. Do NOT build the application yet.

Read:
- AGENT_HANDOFF.md
- all docs under docs/system-design/
- especially 12-business-rules.md through 23-acceptance-criteria.md

First inspect:
1. repository structure
2. framework and runtime
3. package managers
4. existing AGENTS.md
5. existing .codex configuration
6. existing Docker files
7. existing GitHub Actions
8. existing database/migrations
9. existing deployment files
10. existing hosiana_network and Cloudflare Tunnel setup where accessible

Then create or update:

AGENTS.md

.codex/
├── config.toml
└── agents/
    ├── database.toml
    ├── backend.toml
    ├── frontend.toml
    ├── devops.toml
    └── qa.toml

Use these ownership boundaries:

DATABASE:
- database/
- migrations/
- seeders/

BACKEND:
- apps/backend/

FRONTEND:
- apps/frontend/

DEVOPS:
- deploy/
- .github/workflows/
- Docker-related files

QA:
- tests/

ROOT:
- architecture coordination
- integration
- shared documentation
- conflict resolution
- final release

Do not invent business rules.
Do not hardcode configurable prices, quotas, congregations, beverages or souvenir options.
Do not let one worker overwrite another worker's owned area.

After setup:
1. validate Codex configuration
2. validate agent role discovery
3. report the final multi-agent configuration
4. do not spawn implementation workers yet
```

## Step 3 — Root AGENTS.md rules

The root `AGENTS.md` should include:

```text
# HOSIFEST Engineering Rules

## Architecture
- Modular monolith
- PostgreSQL
- Docker-first
- GitHub Actions CI/CD
- GHCR
- VPS deployment
- Existing Cloudflare Tunnel
- Existing Docker network: hosiana_network

## Business
- Early Bird / Presale / Normal
- Early Bird initial allocation 95
- Hosiana discounted allocation 35
- Mupel Jakarta Pusat allocation 60
- Presale initial allocation 55
- Normal initial allocation 50
- Early Bird base Rp175000
- Hosiana effective Rp150000
- Presale Rp225000
- Normal Rp250000
- Presale includes one beverage + one tumbler
- Beverage catalog is dynamic
- One custom canvas keychain per ticket
- Souvenir customization is mandatory and per-ticket
- Payment proof deadline 30 minutes
- Rejected payment => CANCELLED
- QR supports ENTRY and EXIT
- Re-entry is allowed
- Every movement requires scanning

## Engineering
- Backend is authoritative.
- Never trust frontend totals.
- Use transactions for quota and discount reservations.
- Preserve historical snapshots.
- Payment approval is idempotent.
- Audit sensitive admin changes.
- PostgreSQL must not be public.
- Never commit secrets.
- Every schema change requires a migration.
- Do not perform destructive production changes without approval.

## Multi-Agent
- Respect file ownership.
- Inspect before modifying.
- Never revert another agent's work.
- Do not edit another agent's owned area unless explicitly coordinated.
- Report assumptions and conflicts.
- Run relevant tests before completion.
- Do not spawn nested agents unless instructed by Root.
```

## Step 4 — Register roles

Project-local `.codex/config.toml`:

```toml
[agents.database]
description = "Database engineer for HOSIFEST schema, migrations, constraints and seed data."
config_file = "agents/database.toml"

[agents.backend]
description = "Backend engineer for HOSIFEST domain and REST API."
config_file = "agents/backend.toml"

[agents.frontend]
description = "Frontend engineer for HOSIFEST public site, checkout and e-ticket."
config_file = "agents/frontend.toml"

[agents.devops]
description = "DevOps engineer for Docker, CI/CD, GHCR, VPS and Cloudflare integration."
config_file = "agents/devops.toml"

[agents.qa]
description = "QA engineer for unit, integration, E2E and acceptance testing."
config_file = "agents/qa.toml"
```

Current Codex supports named `[agents.<role>]` profiles, role config files, and multi-agent spawning. Verify the exact feature/config syntax using the installed version before changing global configuration.

## Step 5 — Role file example

`.codex/agents/database.toml`:

```toml
name = "database"
model_reasoning_effort = "high"
sandbox_mode = "workspace-write"

developer_instructions = """
You are the HOSIFEST Database Engineer.

Read AGENTS.md and the relevant system-design documents.

Own:
- database/
- migrations/
- seeders/

Implement PostgreSQL schema, migrations, indexes, constraints and seed data.

Do not modify frontend, backend application code, deployment files or workflows.

Do not hardcode business values.
Report files changed, migrations added, tests and assumptions.
"""
```

Create equivalent role files for backend, frontend, devops and QA.

## Step 6 — Concurrency

Start with:

```text
ROOT + 4 workers
```

Let the Root Agent inspect the installed Codex version and current multi-agent backend before setting the concurrency ceiling. Current Codex exposes `max_concurrent_threads_per_session`, while Multi-Agent V2 has its own configuration and precedence rules.

## Step 7 — Start Wave 1

Give Root this prompt after setup is validated:

```text
Multi-agent setup is complete.

Start WAVE 1.

Spawn these four agents in parallel:
1. database
2. backend
3. frontend
4. devops

Database owns schema/migrations/seeds.
Backend owns apps/backend.
Frontend owns apps/frontend.
DevOps owns deploy, Docker and GitHub workflows.

Do not spawn QA yet.

Wait for all four agents.
Then:
1. review their outputs
2. resolve integration conflicts
3. reconcile database/API contracts
4. run integration tests
5. spawn QA
```

## Step 8 — QA Wave

```text
Spawn QA now.

Validate:
- acceptance criteria
- ticket quota concurrency
- Early Bird eligibility
- Hosiana 35-ticket limit
- Presale beverage
- per-ticket souvenir customization
- 30-minute expiration
- payment rejection => CANCELLED
- quota release
- QR ENTRY
- QR EXIT
- re-entry
- Docker build
- CI/CD
- production-like Compose

Do not change business rules to make tests pass.
Report defects to the owning agent.
```

## Step 9 — Integration loop

```text
Worker
 ↓
Root review
 ↓
Integration
 ↓
Tests
 ↓
QA
 ↓
Defect
 ↓
Owning worker
 ↓
Fix
 ↓
Re-test
```

## Step 10 — Release gate

Use `23-acceptance-criteria.md` as the final gate.

```text
Tests pass
 ↓
Docker images build
 ↓
GHCR push
 ↓
VPS deploy
 ↓
Health/readiness checks
 ↓
Cloudflare Tunnel smoke test
 ↓
Backup/restore verified
 ↓
Production rehearsal
```

## Final repository shape

```text
hosifest/
├── AGENTS.md
├── .codex/
│   ├── config.toml
│   └── agents/
│       ├── database.toml
│       ├── backend.toml
│       ├── frontend.toml
│       ├── devops.toml
│       └── qa.toml
├── apps/
│   ├── frontend/
│   └── backend/
├── database/
├── tests/
├── deploy/
├── .github/
│   └── workflows/
└── docs/
    └── system-design/
```

## Important

Do not assume child agents have isolated worktrees. Verify the behavior of the installed Codex version and keep strict ownership boundaries regardless. Current Multi-Agent V2 supports `spawn_agent` and context control through `fork_turns`, while child agents inherit the current tool/environment context by default.
