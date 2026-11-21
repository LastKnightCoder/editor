import { normalizeDetectedLanguage } from "../utils/transcription-language";

export function resolveVLOptimizationLanguage(language?: string): string {
  if (!language) return "zh";
  return normalizeDetectedLanguage(language);
}
