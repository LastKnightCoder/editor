# /// script
# requires-python = ">=3.11,<3.14"
# dependencies = ["numpy", "scipy", "soundfile", "pedalboard"]
# ///
"""教程片音效：轻打字声与语法成型提示音，全部合成，按事件表渲染成一条音效轨。

用法（在 apps/promo-video 下）：uv run scripts/sfx/sfx.py <events.json> <输出.wav> [--mp3]
events.json：[{ "t": 秒, "kind": "key" | "space" | "enter" | "form" | "click" }]，成片时由打字排期导出。
音色原则：先低通再出声，控制 2–6 kHz（耳朵最敏感、听感「尖」的频段）；同一种事件每次略有差异，避免机关枪感。
"""

import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from pedalboard import Pedalboard, Reverb
from scipy.signal import butter, sosfilt

SR = 48000
rng = np.random.default_rng(5)


def _filter(x, kind, freq):
    wn = [f / (SR / 2) for f in freq] if kind == "band" else freq / (SR / 2)
    return sosfilt(butter(2, wn, btype=kind, output="sos"), x)


def keystroke(body_hz, decay):
    """键帽落底的「哒」：低频木质身体 + 一点点带通噪声的触感，整体低通到 3 kHz"""
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    hz = body_hz * rng.uniform(0.92, 1.08)
    body = np.sin(2 * np.pi * hz * t) * np.exp(-t / decay)
    touch = _filter(rng.standard_normal(n), "band", (500, 1800)) * np.exp(-t / 0.006) * 0.35
    attack = np.clip(t / 0.0015, 0, 1)
    return _filter((body + touch) * attack, "low", 3000) * rng.uniform(0.8, 1.0)


def mallet(hz, decay=0.55):
    """木槌音：基频 + 弱 4 倍泛音（马林巴式），泛音衰减更快，起音 4 ms"""
    n = int(1.2 * SR)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * hz * t) * np.exp(-t / decay) + 0.18 * np.sin(2 * np.pi * hz * 4 * t) * np.exp(-t / 0.08)
    return _filter(tone * np.clip(t / 0.004, 0, 1), "low", 2800)


def form_cue():
    """成型提示：F4 → C5 上行五度，间隔 60 ms，像轻轻「叮咚」一下"""
    first, second = mallet(349.2), mallet(523.3, decay=0.7)
    out = np.zeros(len(first) + int(0.06 * SR))
    out[: len(first)] += first * 0.8
    out[int(0.06 * SR) :][: len(second)] += second * 0.6
    return out


SOUNDS = {
    "key": (lambda: keystroke(210, 0.018), 0.45),
    # 鼠标点按：比键盘更短更轻
    "click": (lambda: keystroke(320, 0.008), 0.35),
    "space": (lambda: keystroke(150, 0.03), 0.6),
    "enter": (lambda: keystroke(140, 0.035), 0.65),
    "form": (form_cue, 0.5),
}

if __name__ == "__main__":
    events = json.loads(Path(sys.argv[1]).read_text())
    out_path = Path(sys.argv[2])
    seconds = max(e["t"] for e in events) + 2.0
    track = np.zeros(int(seconds * SR))
    for e in events:
        make, gain = SOUNDS[e["kind"]]
        audio = make() * gain
        start = int(e["t"] * SR)
        end = min(len(track), start + len(audio))
        track[start:end] += audio[: end - start]
    stereo = np.stack([track, track]).astype(np.float32)
    stereo = Pedalboard([Reverb(room_size=0.25, damping=0.7, wet_level=0.1, dry_level=1.0, width=0.6)])(stereo, SR)
    stereo *= 10 ** (-6 / 20) / np.abs(stereo).max()

    out_path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(out_path, stereo.T, SR, subtype="PCM_24")
    if "--mp3" in sys.argv:
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(out_path), "-codec:a", "libmp3lame", "-b:a", "256k", str(out_path.with_suffix(".mp3"))], check=True)

    power = np.abs(np.fft.rfft(stereo.mean(axis=0))) ** 2
    freqs = np.fft.rfftfreq(stereo.shape[1], 1 / SR)
    print(f"{len(events)} 个事件，{seconds:.1f} 秒；2–6 kHz 能量占比 {power[(freqs > 2000) & (freqs < 6000)].sum() / power.sum() * 100:.2f}%")
