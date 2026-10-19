#!/bin/bash
# 抽产品片低清静帧并拼成 4 列网格图（自检用）：scripts/stills-grid.sh out/frames/xxx 帧号…
# 读网格图坐标前先换算显示缩放（交接文档坑 21）；渲染要关掉 Agent 沙箱（坑 1）。
set -u
cd "$(dirname "$0")/.."
dir=$1
shift
mkdir -p "$dir"
rm -f "$dir"/f*.png
for frame in "$@"; do
  npx remotion still src/index.ts Product "$dir/f$frame.png" --frame="$frame" --scale=0.25 --log=error || echo "FAIL $frame"
done
# 按给定顺序编号，再用 tile 拼成 4 列（不足一行补黑）
rm -f "$dir"/seq_*.png
i=0
for frame in "$@"; do cp "$dir/f$frame.png" "$(printf "%s/seq_%03d.png" "$dir" $i)"; i=$((i + 1)); done
cols=$(($# < 4 ? $# : 4))
rows=$((($# + cols - 1) / cols))
ffmpeg -y -loglevel error -i "$dir/seq_%03d.png" -vf "tile=${cols}x${rows}" -frames:v 1 "$dir/grid.png" && rm -f "$dir"/seq_*.png && echo "$dir/grid.png"
