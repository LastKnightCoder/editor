import json
import os
import sys
import wave

os.environ["HF_HUB_OFFLINE"] = "1"
from mlx_qwen3_asr import transcribe
from mlx_qwen3_asr.writers import group_subtitle_segments

audio, model, language, aligner, destination = sys.argv[1:]
with wave.open(audio, "rb") as source:
    duration = source.getnframes() / source.getframerate()

result = transcribe(
    audio,
    model=model,
    language=None if language == "auto" else language,
    return_timestamps=bool(aligner),
    forced_aligner=aligner or None,
    on_progress=lambda event: print(f"{int(event.get('progress', 0) * 100)}%", flush=True),
)

def milliseconds(segments):
    return [
        {
            "text": item["text"],
            "start": round(max(0, min(duration, item["start"])) * 1000),
            "end": round(max(0, min(duration, item["end"])) * 1000),
        }
        for item in segments
    ]

if result.truncated:
    raise RuntimeError("Incomplete transcription")

words = result.segments or []
cues = group_subtitle_segments(words, language=result.language, text=result.text)
with open(destination, "w", encoding="utf-8") as target:
    json.dump({
        "text": result.text, "language": result.language, "duration": duration,
        "segments": milliseconds(cues), "wordSegments": milliseconds(words),
    }, target, ensure_ascii=False)
