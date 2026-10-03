#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# HOSIFEST — application rollback (NOT a database rollback).
#
# Re-deploys the previously recorded known-good image tag. Only works cleanly
# when migrations are forward-compatible, i.e. the older application can run
# against the newer schema. See 20-ci-cd-pipeline.md section 7.
#
# Usage:
#   deploy/scripts/rollback.sh                 # use the recorded previous tag
#   deploy/scripts/rollback.sh sha-<commit>    # use an explicit tag
# ---------------------------------------------------------------------------
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"
STATE_FILE="${STATE_FILE:-$DEPLOY_DIR/.deployed-image-tag}"

log()  { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
fail() { log "ERROR: $*"; exit 1; }

TARGET_TAG="${1:-}"
if [ -z "$TARGET_TAG" ]; then
  [ -f "$STATE_FILE.previous" ] || fail "no previous tag recorded at $STATE_FILE.previous"
  TARGET_TAG="$(cat "$STATE_FILE.previous")"
fi

log "rolling back to $TARGET_TAG"
log "NOTE: this does NOT revert the database. Confirm migrations are forward-compatible."
log "If the schema must be reverted too, restore from a verified backup instead:"
log "  deploy/scripts/restore.sh <dump>"

IMAGE_TAG="$TARGET_TAG" exec "$SCRIPT_DIR/deploy.sh"