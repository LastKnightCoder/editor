#!/usr/bin/env bash
set -euo pipefail

for option in "$@"; do
  case "$option" in
    --apply|--build-cache) ;;
    --help)
      printf '%s\n' '用法：pnpm cleanup:collaboration [--apply] [--build-cache]' \
        '默认只预览；--apply 执行删除；--build-cache 同时清理服务器未使用的 Docker 构建缓存。' \
        '保留当前及上一版镜像、当前发布记录、正式数据和 /srv/tau-collab/backups。' \
        '从本地运行，通过 ssh ali-ecs 操作服务器，不需要启动本地 Docker。'
      exit 0 ;;
    *) echo "不支持的参数：$option" >&2; exit 1 ;;
  esac
done

cd "$(dirname "$0")"
SSH=(ssh -o BatchMode=yes -o ConnectTimeout=12 -o ServerAliveInterval=15 -o ServerAliveCountMax=4)
REMOTE_SCRIPT="$("${SSH[@]}" ali-ecs 'mktemp /tmp/tau-collab-cleanup.XXXXXX')"
[[ "$REMOTE_SCRIPT" =~ ^/tmp/tau-collab-cleanup\.[a-zA-Z0-9]+$ ]] || exit 1
trap '"${SSH[@]}" ali-ecs "rm -f -- '\''$REMOTE_SCRIPT'\''" >/dev/null 2>&1 || true' EXIT
scp -o BatchMode=yes -o ConnectTimeout=12 cleanup-remote.sh "ali-ecs:$REMOTE_SCRIPT"
"${SSH[@]}" ali-ecs "bash '$REMOTE_SCRIPT' $*" < /dev/null
