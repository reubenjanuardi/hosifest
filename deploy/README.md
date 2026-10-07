# HOSIFEST — Deployment Runbook

Owner: DevOps. Scope: `deploy/`, `.github/workflows/`, Docker files.

Everything in this directory is authored against
`hosifest-system-design/07-deployment-architecture.md`,
`09-ci-cd-and-docker.md`, `19-docker-architecture.md`,
`20-ci-cd-pipeline.md` and `11-security-and-operations.md`.

---

## 1. Architecture

```text
                              Internet
                                 |
                            Cloudflare
                                 |
                    EXISTING Cloudflare Tunnel
                        (cloudflared container,
                         NOT managed by HOSIFEST)
                                 |
                                 v
  hosiana_network  .......................................
  (PRE-EXISTING, external: true)                          |
        |                                                |
        |  only the frontend joins this network           |  bridge created
        v                                                |  by this project
  +---------------------+                                |
  | hosifest-frontend   |  nginx :8080                   |
  |  (also on internal) |  /healthz, static Next output   |
  +----------+----------+                                |
             | /api/*  (nginx proxy_pass)               |
             v                                           |
  hosifest_app .........................................|
        |    |                                           |
        |    +--> hosifest-backend :3000                 |
        |              /health  /ready                   |
        |              (egress for payment / storage)    |
        v                                                |
  hosifest_data  (internal: true) .......................|
        |                                                |
        v                                                |
  hosifest-postgres :5432   NO published ports           |
        |                                                |
        v                                                |
  volume: hosifest_postgres_data                          |
       /var/lib/postgresql/data ...........................
```

### Network topology

| Network | Created by | `internal` | Members | Purpose |
| --- | --- | --- | --- | --- |
| `hosiana_network` | **Pre-existing on the VPS** | no | `hosifest-frontend` (+ the existing `cloudflared`) | Public ingress from the tunnel. Declared `external: true`, so Compose never creates, alters, or removes it. |
| `hosifest_app` | this compose project | no | `frontend`, `backend` | Lets nginx resolve `backend:3000` for `/api`. Backend needs egress for QRIS / bank APIs and object storage. |
| `hosifest_data` | this compose project | **yes** | `backend`, `postgres` | Database-only. `internal: true` means no route off the host. |

### How the pre-existing infrastructure is referenced

- **Network.** Both compose files declare:

  ```yaml
  networks:
    hosiana_network:
      external: true
      name: ${HOSIANA_NETWORK_NAME:-hosiana_network}
  ```

  `external: true` means Compose **requires** it to already exist and will error
  out rather than create it. `deploy/scripts/deploy.sh` additionally runs
  `docker network inspect` in preflight and aborts with a clear message if the
  network is missing. Nothing in this project ever runs `docker network create`,
  `connect`, or `rm` against it.

- **Cloudflare Tunnel.** `cloudflared` is deliberately **not declared** in any
  compose file. It is a separate, pre-existing container owned by the VPS
  operator, already attached to `hosiana_network`. HOSIFEST only joins the
  frontend to that network so the existing tunnel can reach it.

  Required tunnel mapping (configured in the Cloudflare dashboard / tunnel
  config, **not** in this repo):

  ```text
  public hostname  ->  http://hosifest-frontend:8080
  ```

  The tunnel's public origin is what the operator puts into `APP_URL` /
  `PUBLIC_API_URL` in `deploy/.env`, and what `HEALTHCHECK_HOST` points at.

- **Isolation.** No service in this stack declares a dependency on, references
  a name of, or otherwise touches unrelated containers on `hosiana_network`.
  HOSIFEST creates only its own two networks and one named volume.

---

## 2. Files

```text
deploy/
├── README.md                     this runbook
├── .env.example                  production env template (placeholders only)
├── env.dev.example              local dev env template (placeholders only)
├── docker-compose.prod.yml       production stack (GHCR images)
├── docker-compose.dev.yml        local dev stack (built from source)
└── scripts/
    ├── deploy.sh                 VPS deploy runner (pull → migrate → up → gate)
    ├── rollback.sh               redeploy previous known-good SHA
    ├── verify-host.sh            READ-ONLY preflight inspection
    ├── backup.sh                 PostgreSQL logical backup + verify + prune
    └── restore.sh                PostgreSQL restore (destructive, gated)

apps/backend/Dockerfile       multi-stage, non-root, HEALTHCHECK /health (context = REPO ROOT)
.dockerignore                   repo-root context rules; keeps migrations/, drops secrets + frontend

.github/workflows/
├── ci.yml                        PR/push: lint, typecheck, test, build, image scan
├── release.yml                   main: build, scan, push SHA-tagged images to GHCR
└── deploy-production.yml         main: SSH deploy, migrations, health gate
```

---

## 3. Images and GHCR

| App | Image | Tag |
| --- | --- | --- |
| Frontend | `ghcr.io/<org>/hosifest-frontend` | `sha-<full-commit-sha>` |
| Backend | `ghcr.io/<org>/hosifest-backend` | `sha-<full-commit-sha>` |

- Production uses **SHA tags only** — never `latest`. Production pulls images
  from GHCR and does **not** need the source repository on the VPS.
- `release.yml` tags with `type=sha,format=sha-,prefix=sha-`, producing
  `sha-<commit>`.
- `deploy-production.yml` refuses any tag that is not `sha-<40-hex>`.
- The image references live in `deploy/docker-compose.prod.yml` via
  `IMAGE_REGISTRY` and `IMAGE_TAG`:

  ```yaml
  image: ${IMAGE_REGISTRY:-ghcr.io/${GITHUB_REPOSITORY_OWNER:-hosifest}}/hosifest-frontend:${IMAGE_TAG:?...}
  ```

### GHCR package permissions

The GHCR packages must be visible to the VPS Docker daemon. Either:

- attach the packages to the GitHub organisation or repository linked to the VPS
  account, or
- create a read-only `GCR_PAT` (classic PAT, scope `read:packages`) and on the
  VPS run `echo "$GCR_PAT" | docker login ghcr.io -u <user> --password-stdin`.

If the GHCR namespace is **private**, add the SSH private key to
`~/.docker/config.json` (base64 of the whole file, `docker login` style) — see
`Required GitHub Secrets`.

---

## 4. Required GitHub Secrets

| Secret | Scope | Purpose |
| --- | --- | --- |
| `VPS_HOST` | repo | Hostname or IP of the target VPS. |
| `VPS_USER` | repo | SSH user with Docker access (e.g. a non-root member of the `docker` group). |
| `VPS_SSH_KEY` | repo | **Private** SSH key, PEM/OpenSSH unencrypted. Added to the agent in-memory; never echoed. |
| `VPS_PORT` | repo | Optional. SSH port. Defaults to `22`. |
| `GITHUB_TOKEN` | automatic | `packages: write` for GHCR push; `packages: read` for deploy. Not user-created. |

Optional **Actions variables** (not secrets):

| Variable | Purpose |
| --- | --- |
| `PRODUCTION_URL` | Public URL, linked from the `production` GitHub Environment for the deployment link. |

### GHCR read credentials on the VPS (if the namespace is private)

Store the Docker auth on the VPS — **not** in this repo, **not** in GitHub
Actions. See section 3.

### GitHub Environment

`deploy-production.yml` declares `environment: production`. Create it in
**Settings → Environments** and, if desired, require reviewer approval so a
merge to `main` cannot deploy without a human.

---

## 5. Required VPS environment variables

Copy the template on the VPS and fill it in:

```bash
cd /opt/stacks/hosifest
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
```

| Variable | Secret? | Notes |
| --- | --- | --- |
| `IMAGE_TAG` | no | `sha-<commit>`. Set per deployment by the workflow. |
| `IMAGE_REGISTRY` | no | e.g. `ghcr.io/your-org`. |
| `NODE_ENV` | no | `production`. Compose pins it anyway. |
| `APP_URL` | no | Canonical public origin, e.g. `https://hosifest.example.id`. |
| `PUBLIC_API_URL` | no | Browser-facing API base through the proxy, e.g. `https://.../api`. |
| `STORAGE_ENDPOINT` | no | S3-compatible endpoint for payment proofs. |
| `STORAGE_BUCKET` | no | Bucket name. |
| `PAYMENT_CONFIGURATION` | **treat as secret** | JSON blob of QRIS / bank transfer config. |
| `LOG_LEVEL` | no | `debug` \| `info` \| `warn` \| `error`. |
| `JWT_SECRET` | **yes** | ≥ 32 random bytes, e.g. `openssl rand -hex 32`. |
| `DATABASE_URL` | **yes** | `postgres://hosifest:<pw>@postgres:5432/hosifest`. |
| `POSTGRES_DB` | no | Default `hosifest`. |
| `POSTGRES_USER` | no | Default `hosifest`. |
| `POSTGRES_PASSWORD` | **yes** | Least-privilege role password. |
| `HOSIANA_NETWORK_NAME` | no | Default `hosiana_network`. Must already exist. |
| `TZ` | no | Default `Asia/Jakarta`. |
| `HEALTHCHECK_SCHEME` | no | `https` in production. |
| `HEALTHCHECK_HOST` | no | Public tunnel hostname; gates on `/ready`. |
| `HEALTHCHECK_PORT` | no | Default `8080`. |
| `HEALTHCHECK_PATH` | no | Default `/ready`. |

`deploy/.env` is covered by the repository `.gitignore` (`.env`, `.env.*` with
`!.env.example`). **Never** commit a filled copy.

---

## 6. Migration command

The backend image ships `migrations/` so the VPS needs no checkout. The deploy
pipeline runs exactly:

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env \
  run --rm --no-deps backend npm run migrate
```

which must apply every `migrations/*.sql` in **ascending filename order** and be
safe to re-run (idempotent where appropriate). Migrations run **before**
`up -d`, so the new schema is in place when the new application starts.

---

## 7. Deployment runbook

### 7.1 One-time VPS preparation

1. Install Docker Engine + Compose v2.
2. Confirm the **pre-existing** tunnel infrastructure:

   ```bash
   deploy/scripts/verify-host.sh
   ```

   It prints the `hosiana_network` members and the `cloudflared` container
   without changing anything.
3. Create the deploy directory and place the repo's `deploy/` there:

   ```bash
   sudo mkdir -p /opt/stacks/hosifest/deploy
   # copy deploy/ from the repository to /opt/stacks/hosifest/deploy/
   ```
4. Create `deploy/.env` from `deploy/.env.example`; `chmod 600`.
5. Add the deploy SSH public key to `~<VPS_USER>/.ssh/authorized_keys`.
6. Confirm the Cloudflare Tunnel routes the public hostname to
   `http://hosifest-frontend:8080`.

### 7.2 Automatic deployment (merge to `main`)

```text
release.yml      build → scan → push ghcr.io/<org>/hosifest-{frontend,backend}:sha-<commit>
deploy-production.yml
                 concurrency group: deploy-production (never parallel)
                 SSH: sync deploy scripts
                 SSH: verify-host.sh (read-only)
                 SSH: deploy.sh → preflight, pull, migrate, up -d, /ready gate
```

### 7.3 Manual deployment / re-run

```bash
# On the VPS
cd /opt/stacks/hosifest
IMAGE_TAG=sha-<commit> deploy/scripts/deploy.sh
```

`deploy.sh` order of operations:

1. **Preflight** — assert `IMAGE_TAG` matches `sha-*`, assert all required env
   vars are set, assert `hosiana_network` exists.
2. **Pull** — `docker compose ... pull` (SHA-tagged images from GHCR).
3. **Migrate** — `run --rm backend npm run migrate`.
4. **Up** — `up -d --remove-orphans`.
5. **Health gate** — wait for every service to report `healthy`, then poll
   `GET $HEALTHCHECK_SCHEME://$HEALTHCHECK_HOST:$HEALTHCHECK_PORT/ready`.
6. **Record** — write `IMAGE_TAG` to `deploy/.deployed-image-tag`, keeping the
   previous value as `.previous` (the rollback pointer).

### 7.4 Local development

```bash
cp deploy/env.dev.example deploy/.env
docker compose --env-file deploy/.env -f deploy/docker-compose.dev.yml up --build
```

Dev-only difference: Postgres is published on **`127.0.0.1:5432`** for local
tooling, and the frontend/backend run the dev servers. That loopback binding is
**never** present in `docker-compose.prod.yml`.

Local checks:

```bash
docker compose -f deploy/docker-compose.dev.yml exec backend curl -fsS http://127.0.0.1:3000/health
docker compose -f deploy/docker-compose.dev.yml exec backend curl -fsS http://127.0.0.1:3000/ready
docker compose -f deploy/docker-compose.dev.yml exec frontend wget -qO- http://127.0.0.1:8080/healthz
```

---

## 8. Health checks

| Service | Endpoint | Meaning |
| --- | --- | --- |
| `hosifest-frontend` | `GET /healthz` (nginx, port 8080) | Container-local liveness. No upstream dependency, so nginx flapping cannot cascade. |
| `hosifest-frontend` | `GET /api/health`, `GET /api/ready` | Proxied to the backend through `/api`. |
| `hosifest-backend` | `GET /health` | Process is up. |
| `hosifest-backend` | `GET /ready` | Dependencies (notably PostgreSQL) are usable for request processing. |
| `hosifest-postgres` | `pg_isready -U <user> -d <db>` | Accepting connections. |

The backend container `HEALTHCHECK` in `apps/backend/Dockerfile` hits `/health`.
The frontend container `HEALTHCHECK` hits `/healthz`.

**Backend contract (owned by the backend agent):** both endpoints must be
exposed **unprefixed** at the root — `http://<backend>:3000/health` and
`/ready` — because nginx proxies `/api/*` verbatim to the backend. If the
backend instead serves them under `/api`, tell Root: the nginx `proxy_pass` and
the deploy health gate both need adjusting.

---

## 9. Rollback

Application rollback and database rollback are separate concerns. Prefer
forward-compatible migrations so rolling back the application does **not**
require rolling back the schema.

### 9.1 Application rollback

```bash
cd /opt/stacks/hosifest

# Roll back to the recorded previous SHA
deploy/scripts/rollback.sh

# Or target a specific known-good SHA
deploy/scripts/rollback.sh sha-<previous-good-commit>
```

This re-runs the same `pull → migrate → up -d → /ready` sequence with the older
tag. `migrate` must be a no-op when the schema is already ahead (idempotent,
forward-compatible migrations).

### 9.2 Manual rollback

```bash
sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=sha-<previous-good-commit>/' deploy/.env
deploy/scripts/deploy.sh
```

### 9.3 Database rollback (destructive — approval required)

Only if a migration was not forward-compatible:

```bash
CONFIRM_RESTORE=YES deploy/scripts/restore.sh <verified-dump>
```

Never use a destructive schema command as an automatic rollback shortcut
(`20-ci-cd-pipeline.md` section 6).

### 9.4 Migration rules for contributors

- Versioned, reviewed, and idempotent where appropriate.
- Add columns/tables rather than rename/drop in the same release that ships code
  using them.
- Split destructive cleanup (drop a column) into a later release, after the
  application version that stopped reading it has been deployed and verified.

---

## 10. Backup and restore runbook

Backups are logical (`pg_dump --format=custom`) taken **inside** the postgres
container — no host port, no network exposure.

### 10.1 Backup

```bash
cd /opt/stacks/hosifest
deploy/scripts/backup.sh
```

- Writes `deploy/backups/hosifest-<db>-<UTC timestamp>.dump` with `umask 077`.
- Verifies each archive with `pg_restore --list` before trusting it.
- Writes a `.sha256` sidecar.
- Prunes dumps older than `RETENTION_DAYS` (default 14).

Options:

```bash
BACKUP_DIR=/mnt/backups/hosifest RETENTION_DAYS=30 deploy/scripts/backup.sh
```

### 10.2 Scheduling

```cron
# /etc/cron.d/hosifest-backup  — daily 02:15, log to /var/log/hosifest-backup.log
15 2 * * * /opt/stacks/hosifest/deploy/scripts/backup.sh >> /var/log/hosifest-backup.log 2>&1
```

Alert on any non-zero exit code. Off-host replication is a separate operator
concern; a backup on the same VPS does not survive VPS loss.

### 10.3 Restore

```bash
cd /opt/stacks/hosifest

# 1. Rehearse into a scratch database first
TARGET_DB=hosifest_restore_test CONFIRM_RESTORE=YES \
  deploy/scripts/restore.sh deploy/backups/hosifest-hosifest-<ts>.dump

# 2. Real restore, only with explicit approval
CONFIRM_RESTORE=YES \
  deploy/scripts/restore.sh deploy/backups/hosifest-hosifest-<ts>.dump
```

`restore.sh` sequence:

1. Verify the `.sha256` checksum (aborts on mismatch).
2. Refuse to proceed unless `CONFIRM_RESTORE=YES`.
3. Take a **pre-restore safety backup** of the current database.
4. `stop backend` so nothing writes mid-restore.
5. Terminate sessions, `DROP DATABASE`, `CREATE DATABASE`.
6. `pg_restore --exit-on-error`.
7. `up -d backend`, then poll `/ready` for up to 150s.

### 10.4 Restore verification (required after any restore)

- `/ready` returns 200.
- Row counts sane: `SELECT count(*) FROM orders;`, `tickets`, `users`.
- Config rows intact: `SELECT * FROM configuration;` — prices, quotas, phases.
- Log in as an admin in the browser.
- Confirm the newest migration is applied.

---

## 11. Security notes

- **No secrets in images.** `.dockerignore` and `apps/frontend/.dockerignore` exclude `.env*`; no `ARG`
  or `ENV` in either Dockerfile carries a secret. Only `NEXT_PUBLIC_*` values
  would be inlined at frontend build time, and none are passed here.
- **Least privilege.** Both application images run as a non-root user
  (`node` uid 1000; nginx uid 101 via `nginxinc/nginx-unprivileged`, which
  listens on 8080 and needs no capabilities).
- **PostgreSQL is unreachable from outside the VPS.** No `ports:` in the prod
  compose file, and its network is `internal: true`.
- **Backend is not publicly exposed.** It binds no published port; the only
  path in is nginx `/api` → `backend:3000` on `hosifest_app`.
- **Logs.** `gitleaks/gitleaks-action` runs in CI. Deploy scripts echo variable
  *names*, never values; the SSH private key lives only in the in-memory agent.
- **Rate limiting and upload validation** are application responsibilities and
  live in `apps/backend` — nginx caps request bodies at 10m as a backstop only.

---

## 12. Not covered here (flagged to Root)

- Root-level `docker-compose*.yml` — intentionally not created; Root owns
  repository-root compose files. `deploy/docker-compose.prod.yml` is the
  production entry point.
- An optional `worker` service is described in the design docs but has no
  implementation yet. Add it here when the backend exposes a worker entrypoint.
---

## 13. Contract issues to resolve (DevOps → Root)

These were found by reading the sibling agents' committed code. DevOps has
adapted everything it can on its own; the rest need Root coordination because
they cross ownership boundaries.

### 13.1 Resolved inside the DevOps area

| Issue | Resolution |
| --- | --- |
| Migrations live at repo-root `migrations/`, not `apps/backend/migrations/`. | Backend image build context changed to the **repository root**; `apps/backend/Dockerfile` copies `migrations/` into the image. Repo-root `.dockerignore` added. |
| Backend entry point is `dist/server.js`, not `dist/main.js`. | Dockerfile `CMD` corrected to `node dist/server.js`. |
| `apps/backend` has no committed `pnpm-lock.yaml` yet. | `COPY apps/backend/pnpm-lock.yaml*` + `--frozen-lockfile` will FAIL until the backend agent commits a lockfile. **Must be committed before the first CI run.** |

### 13.2 Needs Backend agent

1. **`npm run migrate` uses `tsx`, a devDependency.**
   `apps/backend/package.json` defines `"migrate": "tsx scripts/migrate.ts"`,
   but `apps/backend/scripts/migrate.ts` **does not exist yet**, and the
   production image runs `pnpm prune --prod`, which removes `tsx`. Even once
   the file exists, `npm run migrate` will fail in the production container.

   **Requested fix (backend's area):** compile the migration runner into
   `dist/` and run it with plain `node`, e.g. `"migrate": "node dist/scripts/migrate.js"`,
   with `tsconfig.build.json` including `scripts/**/*.ts`. DevOps then keeps
   `compose run --rm --no-deps backend npm run migrate`.

2. **Backend default port is 3001, not 3000.** `src/config/env.ts` defaults
   `PORT` to `3001`. Compose sets `PORT=3000` explicitly, so this is only a
   problem if that env var is ever dropped. Worth aligning to 3000 or keeping
   the explicit compose value permanently.

3. **Env var names diverge from the design document.** `src/config/env.ts`
   does not currently read `PUBLIC_API_URL`, `STORAGE_ENDPOINT`,
   `STORAGE_BUCKET`, or `PAYMENT_CONFIGURATION`; it instead expects
   `STORAGE_DRIVER`, `STORAGE_LOCAL_ROOT`, `STORAGE_BASE_URL`,
   `STORAGE_MAX_UPLOAD_BYTES`, `STORAGE_ALLOWED_MIME`, `JWT_EXPIRES_IN`,
   `RATE_LIMIT_*`. `19-docker-architecture.md` section 5 lists the first set.
   Compose passes the documented names, so the backend will currently ignore
   them. **Root must reconcile the backend <-> deploy env contract.** Note
   `STORAGE_LOCAL_ROOT=./var/storage` with `STORAGE_DRIVER=local` would write
   payment proofs into container-local storage that is **lost on every
   `up -d`** — production needs durable object storage, not the local driver.

4. **No server entrypoint or health routes exist yet.** `src/` has no
   `server.ts`, no Fastify bootstrap, and no `/health` or `/ready` route
   (verified by searching `src/`). The Dockerfile `CMD` and both healthchecks
   assume these exist. `/health` and `/ready` must be served **unprefixed**
   because nginx proxies `/api` verbatim.

### 13.3 Needs Frontend agent

- `apps/frontend` has `node_modules/` present in the working tree and stray
  `pnpm-install.err` / `pnpm-install.log` files. `apps/frontend/.dockerignore`
  excludes `node_modules`, so images are unaffected, but those files should not
  be committed. `.gitignore` already covers `node_modules/` and `*.log`; the
  `.err` file may not be covered.

### 13.4 Not done, needs Root decision

- No repository-root `docker-compose*.yml` was created — Root owns those.
  `deploy/docker-compose.prod.yml` is the production entry point.
- The optional `worker` service in the design docs has no implementation, so
  no worker image or compose service exists.
- pnpm version is pinned to `9.15.0` in all Dockerfiles and workflows. If
  Root standardises on a different version or a Corepack `packageManager`
  field, all of these must change together.