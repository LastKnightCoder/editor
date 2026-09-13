#!/usr/bin/env bash
# 在服务器上从 git 提交导出源码并构建镜像，为 deploy-remote.sh 准备好镜像与源码快照。
# 本脚本不修改 /opt/tau/editor，切换与回切仍由未改动的 deploy-remote.sh 负责。
set -euo pipefail
umask 077

VERSION="${1:?缺少版本号}"
COMMIT="${2:?缺少提交号}"
BRANCH="${3:?缺少分支名}"
NODE_IMAGE="${4:?缺少基础镜像}"

[[ "$VERSION" =~ ^[0-9]{8}-[0-9]{6}-[a-f0-9]+$ ]] || { echo '版本号格式不正确' >&2; exit 1; }
[[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]] || { echo '提交号格式不正确' >&2; exit 1; }

REPO="${COLLAB_GIT_REPO:-/opt/tau-collab-repo}"
RELEASE="/root/tau-collab-releases/$VERSION"
BUILD="$RELEASE/build"
IMAGE="tau-collaboration:$VERSION"
# 与 deploy-local.sh 打包的路径逐项一致，保证导出目录就是仓库根布局。
CONTEXT=(package.json pnpm-lock.yaml pnpm-workspace.yaml patches packages/collaboration apps/collaboration-server .dockerignore)

test -d "$REPO/objects" || { echo "找不到 git 仓库：$REPO" >&2; exit 1; }
test -d "$RELEASE" || { echo "找不到发布目录：$RELEASE" >&2; exit 1; }

echo "同步 $BRANCH 并校验提交"
git -C "$REPO" fetch --depth=1 origin "$BRANCH"
FETCHED="$(git -C "$REPO" rev-parse FETCH_HEAD)"
test "$FETCHED" = "$COMMIT" || {
  echo "服务器取到的 $BRANCH 提交是 $FETCHED，与本地待发布的 $COMMIT 不一致。" >&2
  echo '本地可能没有先 git fetch，或该提交不是上游分支的最新提交。' >&2
  exit 1
}

echo '导出源码'
rm -rf "$BUILD"
mkdir -p "$BUILD"
git -C "$REPO" archive --format=tar "$COMMIT" "${CONTEXT[@]}" | tar -x -C "$BUILD"
# deploy-remote.sh 要求发布目录下存在该快照，用它同步服务器上的部署目录。
tar --no-xattrs -czf "$RELEASE/source.tar.gz" -C "$BUILD" .

echo "构建 $IMAGE"
# 不用 compose 构建：compose 会合并 docker-compose.override.yml，其中固定的旧版本标签
# 会把新镜像打成旧标签，覆盖正在用于回切的镜像。
docker build --build-arg "NODE_IMAGE=$NODE_IMAGE" \
  -f "$BUILD/apps/collaboration-server/Dockerfile" \
  -t "$IMAGE" "$BUILD"

rm -rf "$BUILD"
docker image inspect "$IMAGE" >/dev/null
echo "构建完成：$IMAGE"
