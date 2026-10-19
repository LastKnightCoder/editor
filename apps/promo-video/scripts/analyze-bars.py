# 按 4 拍一小节统计响度、标出段落跳变：python analyze-bars.py <音频> <beats.json>

import json, sys
import numpy as np, librosa
y, sr = librosa.load(sys.argv[1], sr=22050, mono=True)
beats = json.load(open(sys.argv[2]))["beats"]
rms = librosa.feature.rms(y=y, hop_length=512)[0]
t = librosa.times_like(rms, sr=sr, hop_length=512)
peak = rms.max()
# 以 4 拍为一小节，相位取响度跳变最大的那组
best = None
for phase in range(4):
    bars = beats[phase::4]
    vals = [rms[(t >= a) & (t < b)].mean() / peak for a, b in zip(bars, bars[1:])]
    jumps = sum(abs(np.diff(vals)))
    if best is None or jumps > best[0]:
        best = (jumps, phase, bars, vals)
_, phase, bars, vals = best
print("phase", phase)
for i, (b, v) in enumerate(zip(bars, vals)):
    flag = ""
    if i and abs(v - vals[i - 1]) > 0.12: flag = "  <== 跳变"
    print(f"bar{i:3d} {b:7.3f}s {'#' * int(v * 50):50s}{flag}")
