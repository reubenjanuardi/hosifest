# 07 — Deployment Architecture

## Production Topology

```text
                         Internet
                            |
                            v
                       Cloudflare
                            |
                            v
                Existing Cloudflare Tunnel
                            |
                            v
                     hosiana_network
                            |
                  +---------+----------+
                  |                    |
                  v                    |
          hosifest-frontend            |
                  |                    |
           /api reverse proxy          |
                  v                    |
          hosifest-backend             |
                  |                    |
                  v                    |
          hosifest-postgres <----------+
```

## Containers

### frontend

Responsibilities:
- serve SPA
- reverse proxy `/api`

### backend

Responsibilities:
- REST API
- business logic
- authentication
- transaction management

### postgres

Responsibilities:
- persistent relational data

### worker

Optional but recommended for:
- order expiration
- background report generation
- future asynchronous processing

### cloudflared

Existing service/container.

Do not recreate or replace the existing tunnel unless required.

## Docker Network

Existing external network:

```text
hosiana_network
```

The HOSIFEST stack must connect to this network according to the actual VPS configuration.

## Public Ports

Do not expose PostgreSQL.

Do not expose backend directly to internet.

The preferred public path is:

```text
Cloudflare Tunnel → frontend
```

## Persistent Storage

PostgreSQL must use persistent storage.

Uploaded payment proofs must use a durable storage strategy.

## Runtime Environment

Production configuration comes from VPS environment/secret management.

Do not bake environment secrets into images.

## Health Checks

Frontend and backend should expose health endpoints suitable for Docker health checks.

Recommended:

```http
GET /health
GET /ready
```

## Rollback

Rollback by restoring previous immutable image tag and redeploying through Docker Compose.
