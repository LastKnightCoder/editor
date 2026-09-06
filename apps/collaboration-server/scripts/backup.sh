#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
BACKUP_ROOT="${COLLAB_BACKUP_DIR:-/srv/tau-collab/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_ROOT"
mkdir -p "$BACKUP_ROOT/$STAMP"
docker compose exec -T collaboration node dist/admin.js backup "/data/tmp-backup-$STAMP"
docker compose cp "collaboration:/data/tmp-backup-$STAMP/." "$BACKUP_ROOT/$STAMP/"
docker compose exec -T collaboration rm -rf "/data/tmp-backup-$STAMP"
find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | tail -n +8 | cut -d' ' -f2- | xargs -r rm -rf
echo "$BACKUP_ROOT/$STAMP"
