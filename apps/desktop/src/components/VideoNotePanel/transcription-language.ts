export const VIDEO_NOTE_AUTO_LANGUAGE = "auto";

export function resolveVideoNoteOptimizationLanguage(
  selectedLanguage: string,
  detectedLanguage?: string | null
): string {
  if (selectedLanguage !== VIDEO_NOTE_AUTO_LANGUAGE) {
    return selectedLanguage;
  }
  return detectedLanguage || "zh";
}

/** 支持的转录语言列表 */
export const TRANSCRIPTION_LANGUAGES = [
  { value: VIDEO_NOTE_AUTO_LANGUAGE, label: "自动识别 (Auto Detect)" },
  { value: "zh", label: "中文 (Chinese)" },
  { value: "en", label: "英语 (English)" },
  { value: "ja", label: "日语 (Japanese)" },
  { value: "ko", label: "韩语 (Korean)" },
  { value: "fr", label: "法语 (French)" },
  { value: "de", label: "德语 (German)" },
  { value: "es", label: "西班牙语 (Spanish)" },
  { value: "ru", label: "俄语 (Russian)" },
  { value: "it", label: "意大利语 (Italian)" },
  { value: "pt", label: "葡萄牙语 (Portuguese)" },
  { value: "ar", label: "阿拉伯语 (Arabic)" },
  { value: "hi", label: "印地语 (Hindi)" },
];
