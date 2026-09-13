#!/usr/bin/env bash
# 服务器端构建的部署入口：本地只做检查与测试，镜像在服务器上从 git 提交构建。
# 切换、备份与回切复用未改动的 deploy-remote.sh。
set -euo pipefail

if [[ "${1:-}" == "--help" ]]; then
  printf '%s\n' '用法：pnpm deploy:collaboration:git' \
    '在本地执行：检查提交状态、测试、上传脚本；在服务器上同步提交、构建镜像、备份、迁移验证、更新和健康检查。' \
    '只发布已提交并推送到上游分支的内容，工作区有未提交修改时会拒绝执行。' \
    '需要本地 pnpm 依赖已安装，并能免密 ssh ali-ecs；本地不需要 Docker。' \
    '服务器上需先准备好 git 仓库，默认路径 /opt/tau-collab-repo，可用 COLLAB_GIT_REPO 覆盖。' \
    '目标为已初始化的 /opt/tau/editor，不修改 Nginx、证书和 .env。' \
    '可设置 COLLAB_NODE_IMAGE 指定可信的 Node 24 基础镜像。'
  exit 0
fi
[[ $# -eq 0 ]] || { echo '不支持此参数，请运行 pnpm deploy:collaboration:git --help' >&2; exit 1; }

cd "$(dirname "$0")/../../.."
SSH_TARGET=ali-ecs
NODE_IMAGE="${COLLAB_NODE_IMAGE:-public.ecr.aws/docker/library/node:24-bookworm-slim}"
REPO="${COLLAB_GIT_REPO:-/opt/tau-collab-repo}"
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=12 -o ServerAliveInterval=15 -o ServerAliveCountMax=4)

echo '检查本地提交状态'
[[ -z "$(git status --porcelain)" ]] || {
  echo 'git 模式只能发布已提交的内容，请先提交或暂存本地修改。' >&2
  exit 1
}
UPSTREAM="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)" || {
  echo '当前分支没有上游分支，git 模式需要已推送到远端的提交。' >&2
  exit 1
}
COMMIT="$(git rev-parse HEAD)"
test "$COMMIT" = "$(git rev-parse "$UPSTREAM")" || {
  echo "本地 HEAD 与上游 $UPSTREAM 不一致，请先推送到上游。" >&2
  exit 1
}
BRANCH="${UPSTREAM#*/}"
VERSION="$(date -u +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)"
IMAGE="tau-collaboration:$VERSION"
RELEASE="/root/tau-collab-releases/$VERSION"

echo '检查远端环境'
"${SSH[@]}" "$SSH_TARGET" "test -d '$REPO/objects' && cd /opt/tau/editor/apps/collaboration-server && test -f .env && test -f docker-compose.override.yml && command -v flock >/dev/null && docker compose config --quiet && docker compose ps"

echo '执行服务端与共享协议测试，以及生产入口类型检查'
pnpm --filter @tau/collaboration-server test
pnpm --filter @tau/collaboration test
pnpm --filter @tau/collaboration-server exec tsc --noEmit --target ES2022 \
  --module ESNext --moduleResolution bundler --strict --skipLibCheck \
  --esModuleInterop --types node src/index.ts src/admin.ts

"${SSH[@]}" "$SSH_TARGET" "umask 077; mkdir '$RELEASE'"
scp -o BatchMode=yes -o ConnectTimeout=12 \
  apps/collaboration-server/scripts/deploy-remote-build.sh "$SSH_TARGET:$RELEASE/"
"${SSH[@]}" "$SSH_TARGET" \
  "bash '$RELEASE/deploy-remote-build.sh' '$VERSION' '$COMMIT' '$BRANCH' '$NODE_IMAGE'" < /dev/null

scp -o BatchMode=yes -o ConnectTimeout=12 \
  apps/collaboration-server/scripts/deploy-remote.sh "$SSH_TARGET:$RELEASE/"
# 通过文件运行，防止 docker compose exec 消耗 bash -s 尚未读取的脚本文本。
"${SSH[@]}" "$SSH_TARGET" \
  "bash '$RELEASE/deploy-remote.sh' '$VERSION' && test -f '$RELEASE/deployed-image.txt'" < /dev/null

echo '验证本机访问公网 HTTPS'
curl -fsS --max-time 15 https://collab.xiongtao.life/health/ready
printf '\n部署完成：%s\n发布记录：%s\n' "$IMAGE" "$RELEASE"
