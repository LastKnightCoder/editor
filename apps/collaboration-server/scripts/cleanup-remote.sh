#!/usr/bin/env bash
set -euo pipefail

APPLY=false
BUILD_CACHE=false
for option in "$@"; do
  case "$option" in
    --apply) APPLY=true ;;
    --build-cache) BUILD_CACHE=true ;;
    *) echo "不支持的参数：$option" >&2; exit 1 ;;
  esac
done

APP=/opt/tau/editor/apps/collaboration-server
RELEASE_ROOT=/root/tau-collab-releases
cd "$APP"
exec 9>"$RELEASE_ROOT/deploy.lock"
flock -n 9 || { echo '正在部署或清理，请稍后重试' >&2; exit 1; }
CONTAINER="$(docker compose ps -q collaboration)"
test -n "$CONTAINER"
test "$(docker inspect "$CONTAINER" --format '{{.State.Health.Status}}')" = healthy
CURRENT="$(docker inspect "$CONTAINER" --format '{{.Config.Image}}')"
[[ "$CURRENT" =~ ^tau-collaboration:([0-9]{8}-[0-9]{6}-[a-f0-9]+)$ ]] || {
  echo '无法识别当前发布版本，停止清理' >&2; exit 1;
}
KEEP_RELEASE="$RELEASE_ROOT/${BASH_REMATCH[1]}"
test ! -L "$KEEP_RELEASE"
test "$(cat "$KEEP_RELEASE/deployed-image.txt")" = "$CURRENT"
test -f "$KEEP_RELEASE/previous-compose.override.yml"
PREVIOUS="$(docker compose -f "$KEEP_RELEASE/previous-compose.override.yml" config --format json |
  docker compose exec -T collaboration node -e '
    let input="";
    process.stdin.on("data",chunk=>input+=chunk);
    process.stdin.on("end",()=>{
      const image=JSON.parse(input).services?.collaboration?.image;
      if(typeof image!=="string")process.exit(1);
      console.log(image);
    });
  ')"
[[ "$PREVIOUS" =~ ^tau-collaboration:[a-zA-Z0-9_.-]+$ ]] || exit 1
CURRENT_ID="$(docker image inspect "$CURRENT" --format '{{.Id}}')"
PREVIOUS_ID="$(docker image inspect "$PREVIOUS" --format '{{.Id}}')"
CURRENT_TIME="$(date -d "$(docker image inspect "$CURRENT" --format '{{.Created}}')" +%s)"
printf '保留当前镜像：%s\n保留回滚镜像：%s\n保留发布记录：%s\n' "$CURRENT" "$PREVIOUS" "$KEEP_RELEASE"
echo '正式数据目录和 /srv/tau-collab/backups 不参与清理。'

# 按镜像 ID 保护所有容器（包括停止的容器），同一镜像的别名也保留。
USED_IDS="$CURRENT_ID
$PREVIOUS_ID"
CONTAINERS="$(docker ps -aq)"
if [[ -n "$CONTAINERS" ]]; then
  while IFS= read -r container; do
    USED_IDS="$USED_IDS
$(docker inspect "$container" --format '{{.Image}}')"
  done <<< "$CONTAINERS"
fi

IMAGES=()
IMAGE_LIST="$(docker image ls --filter 'reference=tau-collaboration:*' --format '{{.Repository}}:{{.Tag}}')"
while IFS= read -r image; do
  [[ -n "$image" ]] || continue
  id="$(docker image inspect "$image" --format '{{.Id}}')"
  if printf '%s\n' "$USED_IDS" | grep -Fxq -- "$id"; then continue; fi
  created="$(date -d "$(docker image inspect "$image" --format '{{.Created}}')" +%s)"
  # 保留比当前版本更新的镜像，避免清理刚上传、尚未切换的版本。
  (( created < CURRENT_TIME )) || continue
  IMAGES+=("$image")
done <<< "$IMAGE_LIST"

RELEASES=()
for directory in "$RELEASE_ROOT"/*; do
  [[ -d "$directory" && ! -L "$directory" && "$directory" != "$KEEP_RELEASE" ]] || continue
  name="${directory##*/}"
  [[ "$name" =~ ^[0-9]{8}-[0-9]{6}(-[a-f0-9]+)?$ ]] || continue
  # 当前发布之后产生的目录可能属于正在上传的新版本。
  [[ "$directory" -ot "$KEEP_RELEASE/deployed-image.txt" ]] || continue
  RELEASES+=("$directory")
done

printf '\n待清理镜像标签：%s 个\n' "${#IMAGES[@]}"
for image in "${IMAGES[@]}"; do printf '  %s\n' "$image"; done
printf '待清理发布目录：%s 个\n' "${#RELEASES[@]}"
for directory in "${RELEASES[@]}"; do du -sh -- "$directory"; done
if $BUILD_CACHE; then
  echo '同时清理服务器全部未使用的 Docker 构建缓存（包含其他项目缓存，不删除镜像或卷）。'
fi
if ! $APPLY; then
  echo '以上为预览。添加 --apply 执行清理。'
  exit 0
fi

for image in "${IMAGES[@]}"; do docker image rm "$image"; done
for directory in "${RELEASES[@]}"; do rm -r --one-file-system -- "$directory"; done
if $BUILD_CACHE; then docker builder prune -af; fi
test "$(docker inspect "$CONTAINER" --format '{{.State.Health.Status}}')" = healthy
echo '清理完成，协作容器仍然健康。'
