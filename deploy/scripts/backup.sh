#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# HOSIFEST — PostgreSQL logical backup.
#
# Runs `pg_dump` INSIDE the postgres container against the private named volume.
# Nothing is published to the network; no host port is used.
#
# Usage (on the VPS, from the repository root or deploy/):
#   deploy/scripts/backup.sh                      # uses deploy/.env
#   BACKUP_DIR=/mnt/backups/hosifest deploy/scripts/backup.sh
#   RETENTION_DAYS=30 deploy/scripts/backup.sh
#
# Scheduling example (root crontab), daily 02:15 local time:
#   15 2 * * * /opt/stacks/hosifest/deploy/scripts/backup.sh >> /var/log/hosifest-backup.log 2>&1
#
# Exit codes: 0 success, non-zero failure (alert on non-zero).
# ---------------------------------------------------------------------------
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="${COMPOSE_FILE:-$DEPLOY_DIR/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-$DEPLOY_DIR/.env}"
BACKUP_DIR="${BACKUP_DIR:-$DEPLOY_DIR/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
PROJECT="${PROJECT:-hosifest}"

# Credentials are passed to the container as environment, never on the command
# line, so they do not appear in the host process list.
export PGPASSWORD="${POSTGRES_PASSWORD:-}"
PGUSER="${POSTGRES_USER:-hosifest}"
PGDATABASE="${POSTGRES_DB:-hosifest}"

log()  { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
fail() { log "ERROR: $*"; exit 1; }

[ -f "$ENV_FILE" ] || fail "env file not found: $ENV_FILE"
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

command -v docker >/dev/null 2>&1 || fail "docker is not installed"
docker compose version >/dev/null 2>&1 || fail "docker compose v2 is required"

umask 077
mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$BACKUP_DIR/hosifest-${PGDATABASE}-${TIMESTAMP}.dump"

log "starting logical backup -> $TARGET"

# --clean --if-exists makes the dump self-contained for restore into an empty
# cluster. No --jobs tuning beyond 2: the VPS instance size is modest.
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T \
  -e PGPASSWORD -e PGUSER -e PGDATABASE \
  postgres \
  pg_dump --format=custom --compress=6 --clean --if-exists --no-owner --no-privileges \
  > "$TARGET.part" \
  || fail "pg_dump failed"

mv "$TARGET.part" "$TARGET"

SIZE="$(du -h "$TARGET" | cut -f1)"
log "backup complete: $TARGET ($SIZE)"

# Verify the archive is readable before trusting it.
log "verifying archive"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T \
  -e PGPASSWORD -e PGUSER -e PGDATABASE \
  postgres \
  pg_restore --list < "$TARGET" >/dev/null \
  || fail "archive verification failed (pg_restore --list)"

gpgp="$(sha256sum "$TARGET" | cut -d' ' -f1)"
printf '%s  %s\n' "$gpgp" "$(basename "$TARGET")" > "$TARGET.sha256"
log "checksum written: $TARGET.sha256"

log "pruning dumps older than ${RETENTION_DAYS} days"
find "$BACKUP_DIR" -maxdepth 1 -type f \
  -name "hosifest-${PGDATABASE}-*.dump*" -mtime "+$RETENTION_DAYS" -print -delete \
  | sed 's/^/  removed /' || true

log "done"