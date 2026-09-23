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
