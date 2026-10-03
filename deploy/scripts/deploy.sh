#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# HOSIFEST — VPS-side deployment runner.
#
# Invoked by .github/workflows/deploy-production.yml over SSH. It never builds
# images; production consumes immutable images already present in GHCR.
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
log "running migrations (migrations/*.sql, ascending filename order)"
compose run --rm --no-deps backend npm run migrate

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

log "probing /ready"
READY_URL="${HEALTHCHECK_SCHEME:-https}://${HEALTHCHECK_HOST:-127.0.0.1}:${HEALTHCHECK_PORT:-8080}${HEALTHCHECK_PATH:-/ready}"
attempt=0
until curl -fsS --max-time 10 "$READY_URL" >/dev/null 2>&1; do
  attempt=$(( attempt + 1 ))
  [ "$attempt" -lt 30 ] || fail "/ready gate failed at $READY_URL"
  sleep 10
done

# --- 6. record -------------------------------------------------------------
if [ -f "$STATE_FILE" ]; then
  cp "$STATE_FILE" "$STATE_FILE.previous"
fi
printf '%s\n' "$IMAGE_TAG" > "$STATE_FILE"
log "recorded deployed tag in $STATE_FILE (previous kept as .previous)"
log "deployment of $IMAGE_TAG completed"