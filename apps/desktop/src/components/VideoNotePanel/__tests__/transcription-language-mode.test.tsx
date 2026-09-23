import { describe, expect, it } from "vitest";
import {
  VIDEO_NOTE_AUTO_LANGUAGE,
  resolveVideoNoteOptimizationLanguage,
} from "../transcription-language";

describe("VideoNote 转录语言模式", () => {
  it("默认语言应为自动识别", () => {
    expect(VIDEO_NOTE_AUTO_LANGUAGE).toBe("auto");
  });

  it("自动模式应优先使用检测语言并可回退中文", () => {
    expect(resolveVideoNoteOptimizationLanguage(VIDEO_NOTE_AUTO_LANGUAGE, "en")).toBe("en");
    expect(resolveVideoNoteOptimizationLanguage(VIDEO_NOTE_AUTO_LANGUAGE, null)).toBe("zh");
  });

  it("手动模式应保持用户选择语言", () => {
    expect(resolveVideoNoteOptimizationLanguage("ja", "en")).toBe("ja");
  });
});
