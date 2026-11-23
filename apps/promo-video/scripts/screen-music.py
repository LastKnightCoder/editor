# /// script
# requires-python = ">=3.11,<3.14"
# dependencies = ["numpy", "librosa", "soundfile"]
# ///
"""配乐筛选（librosa）：给候选曲打分，挑出适合铺在字幕和点按声下面的曲子。

用法（在 apps/promo-video 下）：uv run scripts/screen-music.py <目录或音频>... [--min-length 秒] [--profile 曲目编号]
口径（教程片选曲时定的）：起音密度低、打击乐占比低、2–6 kHz 和 6 kHz 以上少（没有持续的镲片 / 沙锤）、
响度起伏小（没有 impact、突然进鼓）、可用长度够。分数只用来排序缩小试听范围，最后靠耳朵定。
「律动」是拍点上的起音强度除以平均值：接近 1 说明这首曲子没有明显的节拍，BPM 一栏也就不作数。

--profile 额外打印该曲每 4 秒的响度条，看段落起伏和收尾（从第一个有声的秒算起）。
"""

import argparse
import sys
from pathlib import Path

import librosa
import numpy as np

SR = 22050
HOP = 512
N_FFT = 2048
# 听感「尖」的频段，以及镲片 / 沙锤所在的频段
BAND = (2000, 6000)
AIR = 6000
# 低于最响处这么多 dB 就算没声，用来量开头静音和可用长度
SILENCE_DB = -45


def db(value):
    return 20 * np.log10(np.maximum(value, 1e-9))


def measure(path):
    y, _ = librosa.load(path, sr=SR, mono=True)
    duration = len(y) / SR
    spectrum = np.abs(librosa.stft(y, n_fft=N_FFT, hop_length=HOP))
    power = spectrum**2
    total = power.sum()

    harmonics, percussive = librosa.decompose.hpss(spectrum)
    percussive_share = (percussive**2).sum() / (harmonics**2 + percussive**2).sum()
    freqs = librosa.fft_frequencies(sr=SR, n_fft=N_FFT)
    band_share = power[(freqs >= BAND[0]) & (freqs < BAND[1])].sum() / total
    air_share = power[freqs >= AIR].sum() / total

    strength = librosa.onset.onset_strength(y=y, sr=SR, hop_length=HOP)
    loudness = db(librosa.feature.rms(y=y, hop_length=HOP)[0])
    loudness -= loudness.max()
    audible = np.flatnonzero(loudness > SILENCE_DB)
    if not len(audible):
        return None
    head = librosa.frames_to_time(audible[0], sr=SR, hop_length=HOP)
    tail = librosa.frames_to_time(audible[-1], sr=SR, hop_length=HOP)
    usable = tail - head

    onsets = librosa.onset.onset_detect(onset_envelope=strength, sr=SR, hop_length=HOP, units="frames")
    onsets = onsets[(onsets >= audible[0]) & (onsets <= audible[-1])]
    onset_rate = len(onsets) / usable

    tempo, beats = librosa.beat.beat_track(onset_envelope=strength, sr=SR, hop_length=HOP, units="time")
    # 节拍追踪器在没有鼓的曲子里也会铺一层均匀的网格，间隔看不出差别；改看拍点上的起音比平均强多少（≈1 就是没律动）
    beat_frames = np.clip(librosa.time_to_frames(beats, sr=SR, hop_length=HOP), 0, len(strength) - 1)
    pulse = float(strength[beat_frames].mean() / (strength.mean() + 1e-9))

    # 从第一个有声的秒算起，并把底截在 -30 dB：从静音淡入不算响度跳变
    per_second = np.array([loudness[i : i + SR // HOP].mean() for i in range(0, len(loudness), SR // HOP)])
    per_second = np.maximum(per_second[int(head) :], SILENCE_DB / 1.5)
    # 相邻 2 秒窗口的响度跳变：impact / 突然的鼓进入
    jumps = np.diff(np.convolve(per_second, np.ones(2) / 2, mode="valid"))
    jump = float(max(jumps.max(), 0)) if len(jumps) else 0.0
    spread = float(np.percentile(per_second, 95) - np.percentile(per_second, 20))
    profile = [float(v) for v in per_second]

    return {
        "duration": duration,
        "head": head,
        "usable": usable,
        "onset_rate": float(onset_rate),
        "percussive": float(percussive_share),
        "band": float(band_share),
        "air": float(air_share),
        "jump": jump,
        "spread": spread,
        "tempo": float(np.atleast_1d(tempo)[0]),
        "pulse": pulse,
        "profile": profile,
    }


def fit(metrics):
    """越小越合适：每一项都是「听了会抢戏」的因素"""
    return (
        12 * metrics["onset_rate"]
        + 40 * metrics["percussive"]
        + 160 * metrics["band"]
        + 60 * metrics["air"]
        + 1.2 * max(metrics["jump"], 0)
        + 0.4 * metrics["spread"]
        + 0.3 * max(0.0, 110 - metrics["usable"])
    )


def collect(inputs):
    files = []
    for item in inputs:
        path = Path(item).expanduser()
        files.extend(sorted(path.glob("*.mp3")) if path.is_dir() else [path])
    return files


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("inputs", nargs="+")
    parser.add_argument("--profile", help="打印这首曲子每 4 秒的响度条")
    args = parser.parse_args()

    rows = []
    for file in collect(args.inputs):
        metrics = measure(file)
        if metrics is None:
            print(f"{file.stem}: 没有声音", file=sys.stderr)
            continue
        rows.append((file.stem, metrics))

    header = f"{'曲目':<24}{'分':>6}{'时长':>7}{'可用':>6}{'起音/秒':>8}{'打击':>6}{'2-6k':>7}{'6k+':>7}{'跳变':>6}{'起伏':>6}{'BPM':>5}{'律动':>6}"
    print(header)
    for stem, m in sorted(rows, key=lambda row: fit(row[1])):
        print(
            f"{stem:<24}{fit(m):>6.1f}{m['duration']:>7.1f}{m['usable']:>6.0f}{m['onset_rate']:>8.1f}{m['percussive']:>6.2f}{m['band']:>7.3f}{m['air']:>7.3f}"
            f"{m['jump']:>6.1f}{m['spread']:>6.1f}{m['tempo']:>5.0f}{m['pulse']:>6.2f}"
        )

    if args.profile:
        for stem, m in rows:
            if stem != args.profile:
                continue
            print(f"\n{stem}：每 4 秒平均响度（相对最响处，dB）")
            profile = m["profile"]
            for start in range(0, len(profile), 4):
                chunk = profile[start : start + 4]
                if not len(chunk):
                    break
                level = float(np.mean(chunk))
                print(f"{start:>4}s {'#' * max(0, int((level + 45))):<45s} {level:>6.1f}")


if __name__ == "__main__":
    main()
