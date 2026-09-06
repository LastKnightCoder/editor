#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
DATA_DIR="${COLLAB_DATA_DIR:-/srv/tau-collab/data}"
mkdir -p "$DATA_DIR"
chown 10001:10001 "$DATA_DIR"
if [[ ! -f .env ]]; then cp .env.example .env; fi
if ! grep -q '^COLLAB_DATA_DIR=' .env; then echo "COLLAB_DATA_DIR=$DATA_DIR" >> .env; fi
docker compose up -d --build
docker compose ps
