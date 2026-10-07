#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# HOSIFEST — PostgreSQL restore from a logical dump.
#
# DESTRUCTIVE. This script DROPS and recreates the target database objects.
# It must only be run by an operator with explicit approval, per AGENTS.md
# section 4 ("no destructive database changes without an approved migration and
# backup").
#
# Usage:
#   deploy/scripts/restore.sh /opt/stacks/hosifest/deploy/backups/hosifest-hosifest-20260101T020000Z.dump
#   CONFIRM_RESTORE=YES deploy/scripts/restore.sh <dump>
#   TARGET_DB=hosifest_restore_test deploy/scripts/restore.sh <dump>   # dry-ish rehearsal
#
# Recommended rehearsal: restore into TARGET_DB first, then run application
# smoke checks, then restore into the real database.
# ---------------------------------------------------------------------------
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="${COMPOSE_FILE:-$DEPLOY_DIR/docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-$DEPLOY_DIR/.env}"
BACKUP_DIR="${BACKUP_DIR:-$DEPLOY_DIR/backups}"
TARGET_DB="${TARGET_DB:-${POSTGRES_DB:-hosifest}}"

log()  { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
fail() { log "ERROR: $*"; exit 1; }

DUMP="${1:-}"
[ -n "$DUMP" ] || fail "usage: $0 /absolute/path/to/backup.dump"
[ -f "$DUMP" ] || fail "dump not found: $DUMP"

[ -f "$ENV_FILE" ] || fail "env file not found: $ENV_FILE"
set -a; . "$ENV_FILE"; set +a

export PGPASSWORD="${POSTGRES_PASSWORD:-}"
PGUSER="${POSTGRES_USER:-hosifest}"
SRC_DB="${POSTGRES_DB:-hosifest}"

# Verify checksum when a sidecar file exists.
if [ -f "$DUMP.sha256" ]; then
  log "verifying checksum"
  ( cd "$(dirname "$DUMP")" && sha256sum --check "$(basename "$DUMP").sha256" ) \
    || fail "checksum mismatch — refusing to restore"
else
  log "WARNING: no .sha256 sidecar found for $DUMP"
fi

# Refuse to continue unless the operator confirms explicitly.
if [ "${CONFIRM_RESTORE:-}" != "YES" ]; then
  log "This is a DESTRUCTIVE restore into database '$TARGET_DB' (source: '$SRC_DB')."
  log "Re-run with CONFIRM_RESTORE=YES after obtaining explicit approval and a fresh backup."
  exit 2
fi

# Safety backup of the current state before overwriting anything.
SAFETY="$BACKUP_DIR/pre-restore-$(date -u +%Y%m%dT%H%M%SZ).dump"
umask 077
mkdir -p "$BACKUP_DIR"
log "taking pre-restore safety backup -> $SAFETY"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T \
  -e PGPASSWORD -e PGUSER -e PGDATABASE="$SRC_DB" \
  postgres pg_dump --format=custom --clean --if-exists --no-owner --no-privileges \
  > "$SAFETY" || fail "pre-restore backup failed — aborting"

log "stopping backend so it cannot write during the restore"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" stop backend

# Terminate existing sessions, then drop and recreate.
log "recreating database '$TARGET_DB'"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T \
  -e PGPASSWORD -e PGUSER \
  postgres psql -d postgres -v ON_ERROR_STOP=1 <<SQL
SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
 WHERE datname = '${TARGET_DB}' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS ${TARGET_DB};
CREATE DATABASE ${TARGET_DB} OWNER ${PGUSER};
SQL

log "restoring dump into '$TARGET_DB'"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T \
  -e PGPASSWORD -e PGUSER \
  postgres pg_restore --dbname="$TARGET_DB" --no-owner --no-privileges --exit-on-error \
  < "$DUMP" \
  || fail "pg_restore failed"

log "starting backend"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d backend

log "waiting for backend readiness"
for attempt in $(seq 1 30); do
  if docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T \
       backend curl -fsS http://127.0.0.1:3000/ready >/dev/null 2>&1; then
    log "backend is ready"
    exit 0
  fi
  sleep 5
done

fail "backend did not become ready within 150s — inspect: docker compose logs backend"