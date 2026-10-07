#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# HOSIFEST — VPS-side deployment runner.
#
# Invoked by the `deploy` job of .github/workflows/ci-cd.yml over SSH. It never
# builds images; production consumes immutable images already present in GHCR.
#
# Usage (on the VPS):
#   IMAGE_TAG=sha-<commit> deploy/scripts/deploy.sh
#
# Sequence (matches 09-ci-cd-and-docker.md):
#   1. preflight  — assert required env vars and the external network exist
#   2. pull      — fetch the SHA-tagged images
#   3. migrate   — run every migrations/*.sql in ascending filename order
#   4. up        — recreate containers
#   5. gate      — wait for healthy containers and GET /ready
#   6. record    — persist the deployed SHA for rollback
# ---------------------------------------------------------------------------
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="${COMPOSE_FILE:-$DEPLOY_DIR/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-$DEPLOY_DIR/.env}"
STATE_FILE="${STATE_FILE:-$DEPLOY_DIR/.deployed-image-tag}"
READY_TIMEOUT="${READY_TIMEOUT:-300}"

log()  { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
fail() { log "ERROR: $*"; exit 1; }

IMAGE_TAG="${IMAGE_TAG:-}"
[ -n "$IMAGE_TAG" ] || fail "IMAGE_TAG is required (immutable sha-* tag)"
case "$IMAGE_TAG" in
  sha-*) : ;;
  *) fail "refusing non-SHA image tag: $IMAGE_TAG" ;;
esac

[ -f "$ENV_FILE" ] || fail "env file not found: $ENV_FILE"
set -a; . "$ENV_FILE"; set +a

for required in DATABASE_URL JWT_SECRET APP_URL PUBLIC_API_URL \
                STORAGE_ENDPOINT STORAGE_BUCKET PAYMENT_CONFIGURATION; do
  [ -n "${!required:-}" ] || fail "required variable missing: $required"
done

compose() { docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

# --- 1. preflight ----------------------------------------------------------
# Fail fast if the pre-existing tunnel network is absent. Compose is never
# allowed to create it.
NETWORK_NAME="${HOSIANA_NETWORK_NAME:-hosiana_network}"
docker network inspect "$NETWORK_NAME" >/dev/null 2>&1 \
  || fail "external network '$NETWORK_NAME' does not exist on this host; it is managed outside this project"
log "preflight ok (external network '$NETWORK_NAME' present)"

# --- 2. pull ---------------------------------------------------------------
log "pulling images for IMAGE_TAG=$IMAGE_TAG"
compose pull

# --- 3. migrations ---------------------------------------------------------
# Runs on the backend image, so the VPS needs no application checkout.
# --no-deps must NOT be used here: postgres would never start, so Docker's
# internal DNS has no record for the `postgres` service and migrate fails with
# `getaddrinfo EAI_AGAIN postgres`. The backend service declares
# `depends_on: postgres: condition: service_healthy`, so compose starts postgres
# and waits for it to pass pg_isready before running migrate.
log "running migrations (migrations/*.sql, ascending filename order)"
compose run --rm backend npm run migrate

# --- 4. up -----------------------------------------------------------------
log "recreating containers"
compose up -d --remove-orphans

# --- 5. health gate --------------------------------------------------------
log "waiting for containers to report healthy"
deadline=$(( $(date +%s) + READY_TIMEOUT ))
while [ "$(date +%s)" -lt "$deadline" ]; do
  unhealthy="$(compose ps --format '{{.Service}}:{{.Health}}' \
    | grep -v ':healthy$' || true)"
  if [ -z "$unhealthy" ]; then
    break
  fi
  log "  waiting on: $(echo "$unhealthy" | tr '\n' ' ')"
  sleep 10
done

[ -z "${unhealthy:-}" ] || fail "containers did not become healthy: $unhealthy"

log "probing /ready inside the compose network"
# The probe runs from the backend container, not from the VPS host.
#
# It cannot be a host-side probe: no service in docker-compose.prod.yml
# publishes a `ports:` block (backend and postgres are deliberately never
# exposed, per AGENTS.md section 1), and the frontend's nginx config only
# serves `location = /healthz` — there is no `location = /ready`. So a
# host-side curl to 127.0.0.1:8080/ready has nothing listening and can
# never succeed, no matter how healthy the containers report.
#
# `curl -fsS` is the correct assertion: /ready answers 503 while the
# database is still coming up and 200 only once it is reachable, so this
# waits for real readiness rather than merely for a listening socket.
attempt=0
until compose exec -T backend curl -fsS --max-time 5 \
        "http://127.0.0.1:${BACKEND_PORT:-3000}${HEALTHCHECK_PATH:-/ready}" \
        >/dev/null 2>&1; do
  attempt=$(( attempt + 1 ))
  # Log every attempt. The old host-side probe swallowed curl's stderr, so a
  # gate that could never succeed burned five minutes of silent retries.
  log "  /ready not ok (attempt $attempt/30), retrying in 10s"
  [ "$attempt" -lt 30 ] || fail "/ready gate failed (backend never reported ready)"
  sleep 10
done
log "/ready ok"

# --- 5b. prune superseded images ---------------------------------------------
# Everything above succeeded, so this commit is live and the previous one is
# only a rollback candidate.
#
# `docker image prune -f` alone does NOT do this: it only removes *dangling*
# (untagged) images. A superseded HOSIFEST tag is still tagged and referenced
# by nothing, so it survives and keeps its ~400MB. Filtering by repository is
# what actually reclaims the space.
#
# Scope is the two HOSIFEST repositories only. This VPS also runs
# keuangan-gereja, war_konsumsi and web-placeholder; nothing here may touch
# their images, and `docker system prune` would.
#
# The newest 3 tags per repository are kept. `latest` counts as one of them
# (it shares an image ID with the sha tag of the same build), so this is
# really: the live sha tag, one superseded sha tag for rollback, and latest.
# Keeping only 2 would let `latest` + the live sha occupy both slots and prune
# the rollback candidate that .deployed-image-tag.previous still points at.
KEEP_IMAGE_TAGS="${KEEP_IMAGE_TAGS:-3}"
pruned=0
for repo in hosifest-frontend hosifest-backend; do
  # Newest first. `docker images` sorts by CreatedAt descending already.
  kept=0
  while read -r image; do
    [ -n "$image" ] || continue
    kept=$(( kept + 1 ))
    [ "$kept" -le "$KEEP_IMAGE_TAGS" ] && continue
    # `latest` shares its image ID with the sha tag of the same build; deleting
    # the sha tag is what frees the layers, so never prune by `latest` itself.
    case "$image" in *:latest) continue ;; esac
    if docker rmi "$image" >/dev/null 2>&1; then
      log "  pruned $image"
      pruned=$(( pruned + 1 ))
    else
      log "  could not prune $image (in use by a container)"
    fi
  done < <(docker images --format '{{.Repository}}:{{.Tag}}' \
             | grep -F "/$repo:" || true)
done
log "pruned $pruned superseded image(s); kept the newest $KEEP_IMAGE_TAGS per project"

# Dangling layers plus build cache older than a week. The `--until` filter
# keeps recent cache useful for fast local rebuilds.
log "pruning dangling layers and stale build cache"
docker image prune -f >/dev/null
docker builder prune -f --filter until=168h >/dev/null
log "disk reclaimed"

# --- 6. record -------------------------------------------------------------
if [ -f "$STATE_FILE" ]; then
  cp "$STATE_FILE" "$STATE_FILE.previous"
fi
printf '%s\n' "$IMAGE_TAG" > "$STATE_FILE"
log "recorded deployed tag in $STATE_FILE (previous kept as .previous)"
log "deployment of $IMAGE_TAG completed"