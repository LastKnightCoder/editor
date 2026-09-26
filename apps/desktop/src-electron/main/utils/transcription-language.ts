export const AUTO_LANGUAGE_FALLBACK_THRESHOLD = 0.6;

export interface NormalizedLanguageOption {
  language?: string;
  isAuto: boolean;
}

function normalizeLanguageCode(input?: string | null): string | undefined {
  if (!input) return undefined;
  const value = input.trim().toLowerCase();
  if (!value) return undefined;
  if (value === "auto") return undefined;
  if (value.startsWith("zh")) return "zh";
  if (value.startsWith("en")) return "en";
  if (value.startsWith("ja") || value === "jp") return "ja";
  if (value.startsWith("ko")) return "ko";
  if (value.startsWith("fr")) return "fr";
  if (value.startsWith("de")) return "de";
  if (value.startsWith("es")) return "es";
  if (value.startsWith("ru")) return "ru";
  if (value.startsWith("it")) return "it";
  if (value.startsWith("pt")) return "pt";
  if (value.startsWith("ar")) return "ar";
  if (value.startsWith("hi")) return "hi";
  return value;
}

export function normalizeDetectedLanguage(input?: string | null): string {
  return normalizeLanguageCode(input) || "en";
}

export function normalizeLanguageOption(input?: string | null): NormalizedLanguageOption {
  const normalized = normalizeLanguageCode(input);
  return {
    language: normalized,
    isAuto: !normalized,
  };
}

export function parseLanguageFromLogs(input: string): {
  language: string;
  probability?: number;
} | null {
  if (!input) return null;

  const lines = input.split(/\r?\n/).filter(line => line.trim());
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    const directMatch = line.match(/Detected language:\s*([a-zA-Z-]+)\s*\(([\d.]+)%\)/i);
    if (directMatch) {
      return {
        language: normalizeDetectedLanguage(directMatch[1]),
        probability: Math.max(0, Math.min(1, parseFloat(directMatch[2]) / 100)),
      };
    }

    // whisper.cpp：`whisper_full_with_state: auto-detected language: zh (p = 0.970000)`
    const whisperCppMatch = line.match(
      /auto-detected language:\s*([a-zA-Z-]+)\s*\(p\s*=\s*([\d.]+)\)/i
    );
    if (whisperCppMatch) {
      const value = parseFloat(whisperCppMatch[2]);
      return {
        language: normalizeDetectedLanguage(whisperCppMatch[1]),
        probability: Number.isNaN(value) ? undefined : Math.max(0, Math.min(1, value)),
      };
    }

    const langMatch = line.match(/language(?:\s*[:=])\s*([a-zA-Z-]+)/i);
    if (langMatch) {
      const probMatch = line.match(/(probability|confidence)(?:\s*[:=])\s*([\d.]+)%?/i);
      const probability = probMatch
        ? (() => {
            const value = parseFloat(probMatch[2]);
            if (Number.isNaN(value)) return undefined;
            return value > 1 ? Math.min(1, value / 100) : Math.max(0, value);
          })()
        : undefined;

      return {
        language: normalizeDetectedLanguage(langMatch[1]),
        probability,
      };
    }
  }

  return null;
}

export function inferLanguageFromText(text: string): string {
  if (!text?.trim()) return "en";

  const countMatches = (pattern: RegExp): number => (text.match(pattern) || []).length;

  const hiraganaKatakana = countMatches(/[\u3040-\u30ff]/g);
  const hangul = countMatches(/[\uac00-\ud7af]/g);
  const han = countMatches(/[\u4e00-\u9fff]/g);
  const cyrillic = countMatches(/[\u0400-\u04ff]/g);
  const arabic = countMatches(/[\u0600-\u06ff]/g);
  const devanagari = countMatches(/[\u0900-\u097f]/g);
  const latin = countMatches(/[A-Za-z]/g);

  if (hiraganaKatakana > 0) return "ja";
  if (hangul > 0) return "ko";
  if (cyrillic > 0) return "ru";
  if (arabic > 0) return "ar";
  if (devanagari > 0) return "hi";
  if (han > 0) return "zh";
  if (latin > 0) return "en";
  return "en";
}

export function applyLowConfidenceFallback(
  language: string,
  probability?: number,
  threshold = AUTO_LANGUAGE_FALLBACK_THRESHOLD
): { language: string; languageProbability: number } {
  const normalizedLanguage = normalizeDetectedLanguage(language);
  const normalizedProbability =
    typeof probability === "number" && !Number.isNaN(probability)
      ? Math.max(0, Math.min(1, probability))
      : 1;

  if (normalizedProbability < threshold) {
    return {
      language: "zh",
      languageProbability: normalizedProbability,
    };
  }

  return {
    language: normalizedLanguage,
    languageProbability: normalizedProbability,
  };
}
