#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker image tag tau-collaboration:previous tau-collaboration:local
docker compose up -d --no-build
