# 20 — CI/CD Pipeline

## 1. Repository Flow

```text
feature branch
      ↓
Pull Request
      ↓
CI
      ↓
review
      ↓
main
      ↓
build release images
      ↓
GHCR
      ↓
VPS deployment
```

## 2. Pull Request CI

Required stages:

```text
checkout
→ install with lockfile
→ lint
→ unit tests
→ integration tests
→ application build
→ Docker build
→ image vulnerability scan
```

Do not deploy production from a failing pipeline.

## 3. Production Build

On merge/tag:

```text
Build frontend image
Build backend image
Scan
Tag with Git SHA
Push to GHCR
```

Example:

```text
ghcr.io/<org>/hosifest-frontend:sha-<commit>
ghcr.io/<org>/hosifest-backend:sha-<commit>
```

## 4. VPS Deployment

Use SSH or another controlled deployment channel.

Conceptual:

```bash
export IMAGE_TAG=sha-<commit>
docker compose -f deploy/docker-compose.prod.yml pull
docker compose -f deploy/docker-compose.prod.yml run --rm backend migrate
docker compose -f deploy/docker-compose.prod.yml up -d
```

Exact commands depend on the selected backend framework.

## 5. Deployment Gate

After update:

```text
containers healthy
      ↓
GET /ready
      ↓
database connectivity OK
      ↓
frontend reachable via tunnel
      ↓
deployment success
```

## 6. Migration Rules

Migrations must be:
- versioned
- reviewed
- idempotent where appropriate
- backward-compatible where possible

Never use destructive schema commands as an automatic production deployment shortcut.

## 7. Rollback

Store last-known-good SHA.

Rollback:

```text
IMAGE_TAG = previous SHA
docker compose pull
docker compose up -d
```

Application rollback and database rollback are different concerns. Prefer forward-compatible migrations so application rollback does not require destructive database rollback.

## 8. Secrets

GitHub:
- VPS host
- VPS user
- deployment SSH key
- GHCR permissions as required

VPS:
- database credentials
- JWT secret
- storage credentials
- payment configuration

Never print secrets in CI logs.

## 9. Recommended Workflow Files

```text
.github/workflows/
└── ci-cd.yml
```

CI and production deployment may be combined in a single file, as this repository
does. When they are, keep the stages as separate JOBS with an explicit linear
`needs` chain so a failing stage still stops everything downstream, and keep the
conceptual separation of the stages:

```text
quality ─┬─> image-scan ────> publish ────> deploy
         └─> secret-scan
```

- `quality` — install, typecheck, migrations, seeders, unit + integration tests, build
- `secret-scan` — committed-secret scanning over full history
- `image-scan` — build images and scan them BEFORE anything is pushed (blocking)
- `publish` — build and push immutable `sha-<commit>` tags, then scan as an audit record
- `deploy` — update the VPS

A `pull_request` event must never reach `publish` or `deploy`; guard both with
`if: github.event_name != 'pull_request'`.

## 10. Concurrency

Production deployments should use a deployment concurrency group so two releases do not update the VPS simultaneously.
