# 09 — CI/CD and Docker

## CI

Pull Request:

```text
Checkout
  ↓
Install locked dependencies
  ↓
Lint
  ↓
Unit test
  ↓
Application build
  ↓
Docker build
  ↓
Image security scan
```

PR should fail on any required stage failure.

## CD

Merge to production branch:

```text
GitHub
  ↓
GitHub Actions
  ↓
Build frontend image
  ↓
Build backend image
  ↓
Tag by Git SHA
  ↓
Push GHCR
  ↓
SSH to VPS
  ↓
Pull immutable images
  ↓
Run migrations
  ↓
Docker Compose up -d
  ↓
Health checks
  ↓
Deployment success
```

## Image Naming

Conceptual:

```text
ghcr.io/<org>/hosifest-frontend:sha-<git-sha>
ghcr.io/<org>/hosifest-backend:sha-<git-sha>
```

Production uses SHA tags, not mutable `latest`.

## VPS Deployment

The VPS must not need the application source repository for normal deployment.

Required:
- Docker
- Docker Compose
- access to GHCR
- production environment secrets
- existing `hosiana_network`
- existing Cloudflare Tunnel

## Migrations

Production migrations run before or as part of deployment according to an approved safe migration strategy.

Avoid destructive migrations without explicit approval.

## Health Gate

Deployment is successful only when:
- containers are healthy
- backend readiness succeeds
- frontend responds
- database connectivity succeeds

## Rollback

Keep previous image tag.

Rollback:

```text
Set IMAGE_TAG=<previous-sha>
docker compose pull
docker compose up -d
```

## Secret Policy

Secrets:
- never in Dockerfile
- never in image layer
- never committed to Git
- never logged

Potential secrets:
- database credentials
- JWT secret
- GHCR deployment credentials
- SSH key
- payment account configuration
- object storage credentials
