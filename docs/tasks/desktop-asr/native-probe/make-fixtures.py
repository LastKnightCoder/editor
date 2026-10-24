import pathlib
import subprocess
import sys
import wave

output = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/tau-asr-p1")
output.mkdir(parents=True, exist_ok=True)
text = pathlib.Path(__file__).with_name("fixture.txt").read_text().strip()
subprocess.run(["say", "-v", "Tingting", "-r", "175", "-o", str(output / "fixture.aiff"), text], check=True)
subprocess.run([
    "afconvert", "-f", "WAVE", "-d", "LEI16@16000", "-c", "1",
    str(output / "fixture.aiff"), str(output / "fixture.wav"),
], check=True)
with wave.open(str(output / "fixture.wav"), "rb") as source:
    parameters = source.getparams()
    source.setpos(max(0, source.getnframes() - 5 * source.getframerate()))
    tail = source.readframes(source.getnframes())
for name, samples in [("silence.wav", bytes(16000 * 2 * 2)), ("tail.wav", tail)]:
    with wave.open(str(output / name), "wb") as target:
        target.setparams(parameters)
        target.writeframes(samples)
print("已生成中文合成语音、末尾五秒及两秒纯静音；未采集麦克风。")
