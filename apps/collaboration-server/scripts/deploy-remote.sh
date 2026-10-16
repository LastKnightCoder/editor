#!/usr/bin/env bash
set -euo pipefail
umask 077

VERSION="${1:?缺少版本号}"
[[ "$VERSION" =~ ^[0-9]{8}-[0-9]{6}-[a-f0-9]+$ ]] || { echo '版本号格式不正确' >&2; exit 1; }
IMAGE="tau-collaboration:$VERSION"
ROOT=/opt/tau/editor
APP="$ROOT/apps/collaboration-server"
RELEASE="/root/tau-collab-releases/$VERSION"
cd "$APP"
exec 9>/root/tau-collab-releases/deploy.lock
flock -n 9 || { echo '另一个部署正在进行，请稍后重试' >&2; exit 1; }

docker image inspect "$IMAGE" >/dev/null
test -f "$RELEASE/source.tar.gz"
test -f docker-compose.override.yml
docker compose config --quiet
mkdir "$RELEASE/source"
tar --no-same-owner -xzf "$RELEASE/source.tar.gz" -C "$RELEASE/source"
tar -czf "$RELEASE/previous-deployment.tar.gz" -C "$ROOT" .
cp -a docker-compose.override.yml "$RELEASE/previous-compose.override.yml"

echo '备份现有数据并验证新镜像可读取备份'
bash scripts/backup.sh | tee "$RELEASE/backup.log"
BACKUP="$(tail -n 1 "$RELEASE/backup.log")"
test -f "$BACKUP/manifest.json"
cp -a "$BACKUP" "$RELEASE/migration-check"
chown -R 10001:10001 "$RELEASE/migration-check"
CHECK=(docker run --rm --network none --memory 768m --cap-drop ALL \
  --security-opt no-new-privileges:true -e COLLAB_DATA_DIR=/data \
  -v "$RELEASE/migration-check:/data" "$IMAGE")
"${CHECK[@]}" node dist/admin.js verify-backup /data
"${CHECK[@]}" node -e 'const D=require("better-sqlite3");const db=new D("/data/collaboration.db");if(db.pragma("integrity_check",{simple:true})!=="ok")process.exit(1);db.close();console.log("迁移后的数据库完整性检查通过");'

# 使用 Compose 解析现有 override，保留其配置，只修改镜像版本。
docker compose -f docker-compose.override.yml config --format json |
  docker compose exec -T collaboration node -e '
    let input="";
    process.stdin.on("data",chunk=>input+=chunk);
    process.stdin.on("end",()=>{
      const config=JSON.parse(input);
      config.services.collaboration.image=process.argv[1];
      process.stdout.write(JSON.stringify({services:config.services},null,2)+"\n");
    });
  ' "$IMAGE" > "$RELEASE/next-compose.override.json"

rollback() {
  local status="$1"
  trap - ERR HUP INT TERM
  echo '更新未完成，正在恢复上一个镜像和部署配置' >&2
  if tar -xzf "$RELEASE/previous-deployment.tar.gz" -C "$ROOT" &&
    docker compose up -d --no-build --wait --wait-timeout 90; then
    echo '旧镜像已恢复；数据库保留当前状态，没有自动覆盖更新期间的写入。' >&2
  else
    echo "自动回切失败，请检查 $RELEASE 和容器日志。" >&2
  fi
  exit "$status"
}
trap 'rollback $?' ERR
trap 'rollback 130' INT
trap 'rollback 143' TERM HUP
cp -a "$RELEASE/source/." "$ROOT/"
install -m 600 "$RELEASE/next-compose.override.json" docker-compose.override.yml
docker compose config --quiet
docker compose up -d --no-build --wait --wait-timeout 90
curl -fsS --retry 3 --retry-delay 2 --max-time 15 https://collab.taunote.app/health/ready
docker compose exec -T collaboration node --input-type=module -e '
  import WebSocket from "ws";
  for (const path of ["/ws", "/events"]) {
    await new Promise((resolve,reject)=>{
      const socket=new WebSocket("wss://collab.taunote.app"+path);
      const timer=setTimeout(()=>{socket.terminate();reject(new Error("WSS 超时"));},15000);
      socket.once("error",error=>{clearTimeout(timer);reject(error);});
      socket.once("open",()=>{clearTimeout(timer);socket.close();resolve();});
    });
  }
  console.log("公网 WSS 握手检查通过");
'
docker compose exec -T collaboration node -e 'const D=require("better-sqlite3");const db=new D("/data/collaboration.db",{readonly:true});if(db.pragma("integrity_check",{simple:true})!=="ok")process.exit(1);db.close();'
docker compose ps
docker compose exec -T collaboration node dist/admin.js status
CONTAINER="$(docker compose ps -q collaboration)"
test -n "$CONTAINER"
test "$(docker inspect "$CONTAINER" --format '{{.Config.Image}}')" = "$IMAGE"
test "$(docker inspect "$CONTAINER" --format '{{.Image}}')" = "$(docker image inspect "$IMAGE" --format '{{.Id}}')"
trap - ERR INT TERM HUP
printf '%s\n' "$IMAGE" > "$RELEASE/deployed-image.txt"
printf '\n更新成功，备份目录：%s\n回切配置：%s/previous-compose.override.yml\n' "$BACKUP" "$RELEASE"
