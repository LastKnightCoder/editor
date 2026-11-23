#!/bin/bash
# 抽低清静帧并拼成 4 列的网格图（自检用）：pnpm grid <CompositionId> out/frames/xxx 帧号…
# 一次打包连出所有帧（scripts/stills.ts），再按给定顺序用 tile 拼图（不足一行补黑）。
# 读网格图坐标前先换算显示缩放（产品片交接文档坑 21）；渲染要关掉命令沙箱（坑 1）。
set -u
cd "$(dirname "$0")/.."
id=$1
dir=$2
shift 2
mkdir -p "$dir"
rm -f "$dir"/f*.png
frames=$IFS
for frame in "$@"; do frames="$frames,$frame"; done
node --experimental-strip-types --no-warnings scripts/stills.ts "$id" "$dir" "${frames#,}" --scale=0.25 > /dev/null || { echo "渲染失败"; exit 1; }
i=0
for frame in "$@"; do cp "$dir/f$frame.png" "$(printf "%s/seq_%03d.png" "$dir" $i)"; i=$((i + 1)); done
cols=$(($# < 4 ? $# : 4))
rows=$((($# + cols - 1) / cols))
ffmpeg -y -loglevel error -i "$dir/seq_%03d.png" -vf "tile=${cols}x${rows}" -frames:v 1 "$dir/grid.png"
rm -f "$dir"/seq_*.png
echo "$dir/grid.png"
