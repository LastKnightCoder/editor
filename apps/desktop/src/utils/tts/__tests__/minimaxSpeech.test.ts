import { describe, expect, it } from "vitest";
import {
  isOfficialMinimaxEmotionTag,
  normalizeMinimaxSpeechText,
  stripPauseMarkersForNonMinimax,
  supportsMinimaxEmotionTag,
} from "@/utils/tts/minimaxSpeech";

describe("utils/tts/minimaxSpeech", () => {
  it("应正确判断 speech-2.6 与 speech-2.8+ 的语气标签能力", () => {
    expect(supportsMinimaxEmotionTag("speech-2.6-hd")).toBe(false);
    expect(supportsMinimaxEmotionTag("speech-2.6-turbo")).toBe(false);
    expect(supportsMinimaxEmotionTag("speech-2.8-hd")).toBe(true);
    expect(supportsMinimaxEmotionTag("speech-2.8-turbo")).toBe(true);
    expect(supportsMinimaxEmotionTag("speech-3.0-hd")).toBe(true);
  });

  it("应对停顿时长进行边界修正与格式标准化", () => {
    const text = "你好<#0#>世界，再<#120#>见，还有<#1.236#>一次";
    const normalized = normalizeMinimaxSpeechText(text, "speech-2.8-hd");
    expect(normalized).toContain("你好<#0.01#>世界");
    expect(normalized).toContain("再<#99.99#>见");
    expect(normalized).toContain("还有<#1.24#>一次");
  });

  it("连续停顿或非法位置停顿应自动清理", () => {
    const text = "<#1#>开头 你好<#1#><#2#>世界 结尾<#3#>";
    const normalized = normalizeMinimaxSpeechText(text, "speech-2.8-hd");
    expect(normalized).toBe("开头 你好世界 结尾");
  });

  it("speech-2.6 应移除官方语气标签，speech-2.8 应保留", () => {
    const text = "这很有趣(laughs)，但(laugh)不是官方标签";
    const lowVersion = normalizeMinimaxSpeechText(text, "speech-2.6-hd");
    expect(lowVersion).not.toContain("(laughs)");
    expect(lowVersion).toContain("(laugh)");

    const highVersion = normalizeMinimaxSpeechText(text, "speech-2.8-hd");
    expect(highVersion).toContain("(laughs)");
    expect(highVersion).toContain("(laugh)");
  });

  it("非 Minimax 提供商应移除停顿标记", () => {
    const text = "你好<#1.5#>世界";
    expect(stripPauseMarkersForNonMinimax(text)).toBe("你好世界");
  });

  it("仅官方语气标签应被识别", () => {
    expect(isOfficialMinimaxEmotionTag("(laughs)")).toBe(true);
    expect(isOfficialMinimaxEmotionTag("(laugh)")).toBe(false);
  });
});
