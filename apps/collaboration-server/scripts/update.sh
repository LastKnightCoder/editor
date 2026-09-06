#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
git -C ../.. pull --ff-only
./scripts/backup.sh
docker image inspect tau-collaboration:local >/dev/null 2>&1 && docker image tag tau-collaboration:local tau-collaboration:previous
docker compose build --pull
docker compose up -d --no-build
for i in {1..30}; do
  if docker compose exec -T collaboration node -e "fetch('http://127.0.0.1:3210/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then exit 0; fi
  sleep 2
done
echo "服务未通过健康检查，保留旧容器日志供排查" >&2
docker compose logs --tail=100
exit 1
