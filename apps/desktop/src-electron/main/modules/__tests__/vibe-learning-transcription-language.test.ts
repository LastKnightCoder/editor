import {
  localTranscriptionOptions,
  transcriptionDefaults,
} from "../../../../shared/local-transcription";
import { describe, expect, it } from "vitest";
import { resolveVLOptimizationLanguage } from "../vibe-learning-transcription";

describe("vibe-learning transcription language", () => {
  it("应使用自动识别语言而非固定中文", () => {
    const options = localTranscriptionOptions(
      transcriptionDefaults({}, { segmentationLevel: "word", useLLMOptimization: true })
    );
    expect(options.language).toBe("auto");
    expect(options.sentenceLevel).toBe(false);
    expect(options.useLLMOptimization).toBe(true);
  });

  it("纯文字任务忽略保存的字幕偏好，切回字幕仍可取词级时间进行 AI 断句", () => {
    const selection = transcriptionDefaults({ engine: "qwen", optimize: true, keepWords: false });
    expect(localTranscriptionOptions({ ...selection, output: "text" })).toMatchObject({
      useLLMOptimization: false,
      wordTimestamps: false,
    });
    expect(localTranscriptionOptions(selection)).toMatchObject({
      useLLMOptimization: true,
      wordTimestamps: true,
    });
  });

  it("应优先使用转录结果语言做 LLM 优化", () => {
    expect(resolveVLOptimizationLanguage("en")).toBe("en");
    expect(resolveVLOptimizationLanguage("zh-CN")).toBe("zh");
    expect(resolveVLOptimizationLanguage(undefined)).toBe("zh");
  });
});
