# 扫描成片里的渲染丢帧：python3 scripts/scan-glitches.py out/xxx.mp4（需要 numpy，librosa 的临时 venv 里有）
# 找两类单帧突变——整帧变黑 / 变暗，以及底部模块标签那一条单帧消失；有输出就说明要重渲（交接文档坑 24）。
import subprocess, sys
import numpy as np

path = sys.argv[1]

def frames(vf, w, h):
    raw = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", path, "-vf", vf, "-f", "rawvideo", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.uint8).reshape(-1, h * w).astype(float).mean(1)

def spikes(m, threshold):
    return [i for i in range(1, len(m) - 1) if abs(m[i] - m[i - 1]) > threshold and abs(m[i] - m[i + 1]) > threshold and abs(m[i - 1] - m[i + 1]) < 3]

whole = frames("scale=96:54,format=gray", 96, 54)
tag = frames("crop=640:90:640:940,scale=64:9,format=gray", 64, 9)
dark = [i for i in range(1, len(whole) - 1) if whole[i] < min(whole[i - 1], whole[i + 1]) - 25]
print(f"{len(whole)} 帧；整帧变暗 {len(dark)} 处 {dark}；标签区单帧突变 {len(spikes(tag, 8))} 处 {spikes(tag, 8)[:20]}")
