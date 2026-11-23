#!/bin/bash
# 逐帧比对两个目录里的同名静帧（改了共用组件后确认旧片画面没变）：
#   bash scripts/compare-stills.sh <改前目录> <改后目录>
# 用 ffmpeg 的 SSIM：完全一致为 1.000000；有任何一帧不一致时退出码为 1。
before=$1
after=$2
status=0
for file in "$before"/*.png; do
  name=$(basename "$file")
  if [ ! -f "$after/$name" ]; then echo "$name  改后目录里没有"; status=1; continue; fi
  score=$(ffmpeg -hide_banner -i "$file" -i "$after/$name" -lavfi ssim -f null - 2>&1 | grep -o 'All:[0-9.]*' | head -1)
  if [ "$score" = "All:1.000000" ]; then echo "$name  一致"; else echo "$name  不一致 $score"; status=1; fi
done
exit $status
