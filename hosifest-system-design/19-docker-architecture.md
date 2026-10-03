# 19 — Docker Architecture

## 1. Runtime Components

```text
cloudflared (existing)
       |
       v
hosifest-frontend
       |
       v
hosifest-backend
       |
       v
hosifest-postgres

optional:
hosifest-worker
```

## 2. Networks

Existing public ingress network:

```text
hosiana_network
```

Recommended topology:

```text
cloudflared
   |
hosiana_network
   |
frontend
   |
internal network
   |
backend
   |
internal network
   |
postgres
```

If the existing Cloudflare Tunnel requires backend access through `hosiana_network`, connect only the explicitly required service to that network and keep database connectivity on a private network.

## 3. No Public Database

Never:

```yaml
postgres:
  ports:
    - "5432:5432"
```

Production PostgreSQL must not be published publicly.

## 4. Image Responsibilities

### frontend image

- build frontend
- serve static assets using a production web server
- reverse proxy `/api` to backend

### backend image

- production runtime only
- no development dependencies unless explicitly required
- migrations available through the application/tooling

### worker image

Optional dedicated background processing.

## 5. Configuration

Runtime environment variables include:

```text
NODE_ENV
DATABASE_URL
JWT_SECRET
APP_URL
PUBLIC_API_URL
STORAGE_ENDPOINT
STORAGE_BUCKET
PAYMENT_CONFIGURATION
LOG_LEVEL
```

Do not put secrets in:
- Dockerfile
- image
- Git
- frontend build-time variables unless intentionally public

## 6. Persistence

PostgreSQL:

```text
named volume → /var/lib/postgresql/data
```

Payment proof files require durable object/file storage.

## 7. Health Checks

Backend:

```http
GET /health
GET /ready
```

`/ready` should verify dependencies needed for request processing.

## 8. Resource Separation

The application stack must remain independent from the existing Cloudflare Tunnel container. Do not alter unrelated services on the VPS during HOSIFEST deployment.
