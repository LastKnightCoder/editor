import { describe, expect, it } from "vitest";
import { concatMp3, parseMp3 } from "../mp3";

// MPEG1 Layer III、128kbps、32kHz、单声道：帧长 144 * 128000 / 32000 = 576 字节，每帧 1152 采样
const FRAME_LENGTH = 576;
const FRAME_SECONDS = 1152 / 32000;

const frame = (fill: number, tag?: "Info" | "Xing") => {
  const bytes = new Uint8Array(FRAME_LENGTH).fill(fill);
  bytes.set([0xff, 0xfb, 0x98, 0xc4]);
  if (tag) {
    // 单声道 MPEG1 的 side info 为 17 字节，标签位于 4 + 17
    bytes.set(
      Array.from(tag, char => char.charCodeAt(0)),
      21
    );
  }
  return bytes;
};

const id3v2 = (payloadSize: number) => {
  const bytes = new Uint8Array(10 + payloadSize);
  bytes.set([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, payloadSize]);
  return bytes;
};

const id3v1 = () => {
  const bytes = new Uint8Array(128);
  bytes.set([0x54, 0x41, 0x47]);
  return bytes;
};

const join = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out.buffer;
};

// jsdom 的 Blob 没有 arrayBuffer()
const readBlob = (blob: Blob) =>
  new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });

describe("parseMp3", () => {
  it("剔除 ID3 标签与 Info 头帧，按帧数计时长", () => {
    const stream = parseMp3(join(id3v2(20), frame(1, "Info"), frame(2), frame(3), id3v1()));
    expect(stream).not.toBeNull();
    expect(stream!.frameCount).toBe(2);
    expect(stream!.sampleRate).toBe(32000);
    expect(stream!.duration).toBeCloseTo(2 * FRAME_SECONDS);
    expect(stream!.frames.length).toBe(2 * FRAME_LENGTH);
    expect(Array.from(stream!.frames.subarray(0, 2))).toEqual([0xff, 0xfb]);
    expect(stream!.frames[FRAME_LENGTH + 10]).toBe(3);
  });

  it("非 MP3 数据返回 null", () => {
    const wav = new Uint8Array(4096);
    wav.set([0x52, 0x49, 0x46, 0x46]);
    // 中间偶然出现一个帧同步也不能误判
    wav.set([0xff, 0xfb, 0x98, 0xc4], 100);
    expect(parseMp3(wav.buffer)).toBeNull();
  });
});

describe("concatMp3", () => {
  it("多段首尾相接为一条 audio/mpeg", async () => {
    const a = parseMp3(join(id3v2(4), frame(1, "Xing"), frame(2)))!;
    const b = parseMp3(join(frame(3), frame(4), frame(5)))!;
    const blob = concatMp3([a, b])!;
    expect(blob.type).toBe("audio/mpeg");
    const merged = parseMp3(await readBlob(blob))!;
    expect(merged.frameCount).toBe(4);
    expect(merged.duration).toBeCloseTo(a.duration + b.duration);
  });
});
