#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
BACKUP="${1:?用法: restore.sh /srv/tau-collab/backups/YYYYMMDD-HHMMSS}"
[[ -f "$BACKUP/manifest.json" ]] || { echo "备份目录不完整" >&2; exit 1; }
docker compose down
DATA_DIR="${COLLAB_DATA_DIR:-/srv/tau-collab/data}"
mv "$DATA_DIR" "${DATA_DIR}.before-restore-$(date +%s)"
mkdir -p "$DATA_DIR"
cp -a "$BACKUP/." "$DATA_DIR/"
chmod 700 "$DATA_DIR"
chown -R 10001:10001 "$DATA_DIR"
docker compose up -d
