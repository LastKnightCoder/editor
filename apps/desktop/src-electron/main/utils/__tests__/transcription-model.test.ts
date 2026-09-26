import { describe, expect, it } from "vitest";
import { normalizeModelSize, whisperDtwPreset } from "../transcription-model";

describe("normalizeModelSize", () => {
  it("去掉两种引擎前缀", () => {
    expect(normalizeModelSize("whisper-cpp-base")).toBe("base");
    expect(normalizeModelSize("faster-whisper-small")).toBe("small");
    expect(normalizeModelSize("whisper-cpp-large-v3")).toBe("large-v3");
  });

  it("已是尺寸时原样返回，空值回退 base", () => {
    expect(normalizeModelSize("medium")).toBe("medium");
    expect(normalizeModelSize("")).toBe("base");
    expect(normalizeModelSize(undefined)).toBe("base");
  });
});

describe("whisperDtwPreset", () => {
  it("尺寸换算为 whisper.cpp 预设名", () => {
    expect(whisperDtwPreset("base")).toBe("base");
    expect(whisperDtwPreset("whisper-cpp-large-v3")).toBe("large.v3");
    expect(whisperDtwPreset("large-v3-turbo")).toBe("large.v3.turbo");
  });

  it("不支持的尺寸返回 null", () => {
    expect(whisperDtwPreset("huge")).toBeNull();
  });
});
