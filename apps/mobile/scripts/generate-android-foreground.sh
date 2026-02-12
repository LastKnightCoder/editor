#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SRC_ICON="${MOBILE_DIR}/src-tauri/app-icon.png"
OUT_ICON="${MOBILE_DIR}/src-tauri/app-icon-android-fg.png"
SCALE_PERCENT="${ANDROID_ICON_FOREGROUND_SCALE:-72}"

if [[ ! -f "${SRC_ICON}" ]]; then
  echo "缺少源图标: ${SRC_ICON}"
  exit 1
fi

if ! [[ "${SCALE_PERCENT}" =~ ^[0-9]+$ ]]; then
  echo "ANDROID_ICON_FOREGROUND_SCALE 必须是 1-100 的整数，当前: ${SCALE_PERCENT}"
  exit 1
fi

if (( SCALE_PERCENT < 1 || SCALE_PERCENT > 100 )); then
  echo "ANDROID_ICON_FOREGROUND_SCALE 超出范围，要求 1-100，当前: ${SCALE_PERCENT}"
  exit 1
fi

ICON_WIDTH="$(sips -g pixelWidth "${SRC_ICON}" | awk '/pixelWidth/ { print $2 }')"
ICON_HEIGHT="$(sips -g pixelHeight "${SRC_ICON}" | awk '/pixelHeight/ { print $2 }')"

if [[ -z "${ICON_WIDTH}" || -z "${ICON_HEIGHT}" ]]; then
  echo "无法读取源图尺寸: ${SRC_ICON}"
  exit 1
fi

if [[ "${ICON_WIDTH}" != "${ICON_HEIGHT}" ]]; then
  echo "源图必须是正方形，当前尺寸: ${ICON_WIDTH}x${ICON_HEIGHT}"
  exit 1
fi

TARGET_SIZE="$(( ICON_WIDTH * SCALE_PERCENT / 100 ))"
if (( TARGET_SIZE < 1 )); then
  TARGET_SIZE=1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

RESIZED_ICON="${TMP_DIR}/resized.png"

sips "${SRC_ICON}" \
  -s format png \
  --resampleHeightWidth "${TARGET_SIZE}" "${TARGET_SIZE}" \
  --out "${RESIZED_ICON}" >/dev/null

# 使用白色补边把缩小图标回填到原尺寸，生成专用 Android 前景图。
sips "${RESIZED_ICON}" \
  -s format png \
  --padToHeightWidth "${ICON_WIDTH}" "${ICON_WIDTH}" \
  --padColor FFFFFF \
  --out "${OUT_ICON}" >/dev/null

echo "已生成 Android 前景图: ${OUT_ICON} (scale=${SCALE_PERCENT}%)"
