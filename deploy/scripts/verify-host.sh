#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# HOSIFEST — read-only preflight for a fresh VPS.
#
# Performs NO changes: it only inspects the host and reports what is already in
# place, so an operator can confirm the pre-existing infrastructure is intact
# before the first HOSIFEST deployment.
#
# Usage: deploy/scripts/verify-host.sh
# ---------------------------------------------------------------------------
set -Eeuo pipefail

log()  { printf '%s\n' "$*"; }

log "=== docker ==="
docker --version || log "MISSING: docker"
docker compose version || log "MISSING: docker compose v2"

log ""
log "=== external network (managed outside this project) ==="
NETWORK_NAME="${HOSIANA_NETWORK_NAME:-hosiana_network}"
if docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
  log "OK: '$NETWORK_NAME' exists"
  log "attached containers:"
  docker network inspect "$NETWORK_NAME" \
    --format '{{range $id, $c := .Containers}}  - {{$c.Name}} ({{$c.IPv4Address}}){{println}}{{end}}'
  log "DO NOT remove or reconfigure this network."
else
  log "MISSING: '$NETWORK_NAME' — the VPS operator must create it before first deploy."
fi

log ""
log "=== existing cloudflared container (read-only inspection) ==="
if docker ps --format '{{.Names}}' | grep -qi cloudflared; then
  docker ps --filter 'name=cloudflared' \
    --format '  {{.Names}}  image={{.Image}}  status={{.Status}}'
  log "HOSIFEST does not manage this container. Do not restart or recreate it."
else
  log "No cloudflared container visible to this user."
  log "Confirm the tunnel routes the public hostname to hosifest-frontend:8080."
fi

log ""
log "=== disk ==="
df -h / | tail -1