import { describe, expect, it } from "vitest";
import {
  AUTO_LANGUAGE_FALLBACK_THRESHOLD,
  applyLowConfidenceFallback,
  inferLanguageFromText,
  normalizeLanguageOption,
  parseLanguageFromLogs,
} from "../transcription-language";

describe("transcription-language", () => {
  it("应将 auto/空值归一化为自动模式", () => {
    expect(normalizeLanguageOption("auto")).toEqual({
      language: undefined,
      isAuto: true,
    });
    expect(normalizeLanguageOption("")).toEqual({
      language: undefined,
      isAuto: true,
    });
    expect(normalizeLanguageOption(undefined)).toEqual({
      language: undefined,
      isAuto: true,
    });
  });

  it("应正确解析日志中的语言与置信度", () => {
    const parsed = parseLanguageFromLogs(
      "foo\nDetected language: en (82.30%)\nbar",
    );
    expect(parsed).toEqual({
      language: "en",
      probability: 0.823,
    });
  });

  it("应基于文本脚本推断语言", () => {
    expect(inferLanguageFromText("这是中文测试")).toBe("zh");
    expect(inferLanguageFromText("This is English.")).toBe("en");
    expect(inferLanguageFromText("こんにちは世界")).toBe("ja");
    expect(inferLanguageFromText("안녕하세요")).toBe("ko");
    expect(inferLanguageFromText("Привет мир")).toBe("ru");
    expect(inferLanguageFromText("مرحبا بالعالم")).toBe("ar");
    expect(inferLanguageFromText("नमस्ते दुनिया")).toBe("hi");
  });

  it("低置信度应回退中文（含阈值边界）", () => {
    const low = applyLowConfidenceFallback("en", 0.59);
    expect(low.language).toBe("zh");
    expect(low.languageProbability).toBe(0.59);

    const edge = applyLowConfidenceFallback(
      "en",
      AUTO_LANGUAGE_FALLBACK_THRESHOLD,
    );
    expect(edge.language).toBe("en");
  });
});
