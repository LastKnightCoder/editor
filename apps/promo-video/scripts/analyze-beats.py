# 节拍分析（librosa）：python analyze-beats.py <音频> <输出 beats.json>；结果写进 src/brand/music.ts 的 beats/bpm

import sys, json
import numpy as np, librosa
path = sys.argv[1]
y, sr = librosa.load(path, sr=22050, mono=True)
tempo, beats = librosa.beat.beat_track(y=y, sr=sr, units="time")
onset_env = librosa.onset.onset_strength(y=y, sr=sr)
rms = librosa.feature.rms(y=y)[0]
times = librosa.times_like(rms, sr=sr)
# 每 2 秒的平均响度，看段落起伏
seg = {}
for t, v in zip(times, rms):
    seg.setdefault(int(t // 4) * 4, []).append(v)
print("tempo", float(np.atleast_1d(tempo)[0]), "beats", len(beats))
print("first beats", [round(float(b), 3) for b in beats[:16]])
peak = max(np.mean(v) for v in seg.values())
for k in sorted(seg):
    m = np.mean(seg[k]) / peak
    print(f"{k:4d}s {'#' * int(m * 40):40s} {m:.2f}")
# 新段落：响度跳变明显的位置（4 拍一组）
json.dump({"tempo": float(np.atleast_1d(tempo)[0]), "beats": [round(float(b), 3) for b in beats]}, open(sys.argv[2], "w"))
