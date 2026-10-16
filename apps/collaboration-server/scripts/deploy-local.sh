#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" == "--help" ]]; then
  printf '%s\n' '用法：pnpm deploy:collaboration' \
    '在本地执行：检查、构建 linux/amd64 镜像、上传、备份、迁移验证、更新和健康检查。' \
    '需要本地 Docker 已启动、pnpm 依赖已安装，并能免密 ssh ali-ecs。' \
    '目标为已初始化的 /opt/tau/editor，不修改 Nginx、证书和 .env。' \
    '可设置 COLLAB_NODE_IMAGE 指定可信的 Node 24 基础镜像。'
  exit 0
fi
[[ $# -eq 0 ]] || { echo '不支持此参数，请运行 pnpm deploy:collaboration --help' >&2; exit 1; }

cd "$(dirname "$0")/../../.."
SSH_TARGET=ali-ecs
VERSION="$(date -u +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)"
IMAGE="tau-collaboration:$VERSION"
RELEASE="/root/tau-collab-releases/$VERSION"
NODE_IMAGE="${COLLAB_NODE_IMAGE:-public.ecr.aws/docker/library/node:24-bookworm-slim}"
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=12 -o ServerAliveInterval=15 -o ServerAliveCountMax=4)
WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/tau-deploy.XXXXXX")"
trap 'rm -rf "$WORK_DIR"' EXIT

echo '检查本地与远端环境'
docker info >/dev/null
"${SSH[@]}" "$SSH_TARGET" 'cd /opt/tau/editor/apps/collaboration-server && test -f .env && test -f docker-compose.override.yml && command -v flock >/dev/null && docker compose config --quiet && docker compose ps'

echo '执行服务端与共享协议测试，以及生产入口类型检查'
pnpm --filter @tau/collaboration-server test
pnpm --filter @tau/collaboration test
pnpm --filter @tau/collaboration-server exec tsc --noEmit --target ES2022 \
  --module ESNext --moduleResolution bundler --strict --skipLibCheck \
  --esModuleInterop --types node src/index.ts src/admin.ts

echo "构建 $IMAGE"
# 镜像与远端源码都使用同一份快照，排除本机依赖、数据与运行配置。
COPYFILE_DISABLE=1 tar --no-xattrs --exclude=node_modules --exclude=dist \
  --exclude='.env' --exclude='.env.local' --exclude='data' \
  --exclude=docker-compose.override.yml -czf "$WORK_DIR/source.tar.gz" \
  package.json pnpm-lock.yaml pnpm-workspace.yaml patches packages/collaboration packages/db-schema \
  apps/collaboration-server .dockerignore
mkdir "$WORK_DIR/source"
tar -xzf "$WORK_DIR/source.tar.gz" -C "$WORK_DIR/source"
docker buildx build --platform linux/amd64 --build-arg "NODE_IMAGE=$NODE_IMAGE" \
  -f "$WORK_DIR/source/apps/collaboration-server/Dockerfile" \
  -t "$IMAGE" --load "$WORK_DIR/source"

echo '上传镜像和源码快照'
docker save "$IMAGE" | gzip -1 | "${SSH[@]}" "$SSH_TARGET" docker load
"${SSH[@]}" "$SSH_TARGET" "umask 077; mkdir '$RELEASE'"
scp -o BatchMode=yes -o ConnectTimeout=12 "$WORK_DIR/source.tar.gz" \
  "$WORK_DIR/source/apps/collaboration-server/scripts/deploy-remote.sh" \
  "$SSH_TARGET:$RELEASE/"
# 通过文件运行，防止 docker compose exec 消耗 bash -s 尚未读取的脚本文本。
"${SSH[@]}" "$SSH_TARGET" \
  "bash '$RELEASE/deploy-remote.sh' '$VERSION' && test -f '$RELEASE/deployed-image.txt'" < /dev/null

echo '验证本机访问公网 HTTPS'
curl -fsS --max-time 15 https://collab.taunote.app/health/ready
printf '\n部署完成：%s\n发布记录：%s\n' "$IMAGE" "$RELEASE"
