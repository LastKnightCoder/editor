import { normalizeDetectedLanguage } from "../utils/transcription-language";

export type VLTranscriptionModelSize =
  | "tiny"
  | "base"
  | "small"
  | "medium"
  | "large-v1"
  | "large-v2"
  | "large-v3";

export function buildVLTranscriptionOptions(
  modelSize: VLTranscriptionModelSize,
  hasLLMConfig: boolean,
): {
  modelSize: VLTranscriptionModelSize;
  language: "auto";
  sentenceLevel: boolean;
  useLLMOptimization: boolean;
} {
  return {
    modelSize,
    language: "auto",
    sentenceLevel: !hasLLMConfig,
    useLLMOptimization: hasLLMConfig,
  };
}

export function resolveVLOptimizationLanguage(language?: string): string {
  if (!language) return "zh";
  return normalizeDetectedLanguage(language);
}
