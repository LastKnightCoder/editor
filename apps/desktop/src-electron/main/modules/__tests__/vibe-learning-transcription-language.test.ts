import { describe, expect, it } from "vitest";
import {
  buildVLTranscriptionOptions,
  resolveVLOptimizationLanguage,
} from "../vibe-learning-transcription";

describe("vibe-learning transcription language", () => {
  it("应使用自动识别语言而非固定中文", () => {
    const options = buildVLTranscriptionOptions("base", true);
    expect(options.language).toBe("auto");
    expect(options.sentenceLevel).toBe(false);
    expect(options.useLLMOptimization).toBe(true);
  });

  it("应优先使用转录结果语言做 LLM 优化", () => {
    expect(resolveVLOptimizationLanguage("en")).toBe("en");
    expect(resolveVLOptimizationLanguage("zh-CN")).toBe("zh");
    expect(resolveVLOptimizationLanguage(undefined)).toBe("zh");
  });
});
