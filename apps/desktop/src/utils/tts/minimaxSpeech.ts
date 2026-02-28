import type { MinimaxSpeechModel } from "@/types/minimax";

export const MINIMAX_SPEECH_MODELS: MinimaxSpeechModel[] = [
  "speech-2.8-hd",
  "speech-2.8-turbo",
  "speech-2.6-hd",
  "speech-2.6-turbo",
];

export const MINIMAX_DEFAULT_SPEECH_MODEL: MinimaxSpeechModel = "speech-2.8-hd";

export const MINIMAX_EMOTION_TAGS = [
  "(laughs)",
  "(chuckle)",
  "(coughs)",
  "(clear-throat)",
  "(groans)",
  "(breath)",
  "(pant)",
  "(inhale)",
  "(exhale)",
  "(gasps)",
  "(sniffs)",
  "(sighs)",
  "(snorts)",
  "(burps)",
  "(lip-smacking)",
  "(humming)",
  "(hissing)",
  "(emm)",
  "(sneezes)",
] as const;

const EMOTION_TAG_SET = new Set<string>(MINIMAX_EMOTION_TAGS);
const PAUSE_TAG_REGEX = /<\#([^#]*)\#>/g;

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const EMOTION_TAG_REGEX = new RegExp(
  MINIMAX_EMOTION_TAGS.map((tag) => escapeRegExp(tag)).join("|"),
  "g",
);

function getModelVersion(
  model: string,
): { major: number; minor: number } | null {
  const match = model.match(/^speech-(\d+)\.(\d+)-/);
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
  };
}

export function supportsMinimaxEmotionTag(model: string): boolean {
  const version = getModelVersion(model);
  if (!version) {
    return false;
  }

  if (version.major > 2) {
    return true;
  }

  return version.major === 2 && version.minor >= 8;
}

function clampPauseSeconds(value: number): number {
  if (value < 0.01) {
    return 0.01;
  }
  if (value > 99.99) {
    return 99.99;
  }
  return value;
}

function formatPauseSeconds(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function hasSpeakableText(input: string): boolean {
  const withoutEmotionTags = input.replace(EMOTION_TAG_REGEX, "");
  return withoutEmotionTags.trim().length > 0;
}

function sanitizePauseMarkers(text: string): string {
  const normalizedTokens: Array<
    { type: "text"; value: string } | { type: "pause"; value: string }
  > = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = PAUSE_TAG_REGEX.exec(text)) !== null) {
    if (match.index > cursor) {
      normalizedTokens.push({
        type: "text",
        value: text.slice(cursor, match.index),
      });
    }

    const rawNumber = match[1]?.trim() ?? "";
    const parsed = Number(rawNumber);
    if (Number.isFinite(parsed)) {
      const clamped = clampPauseSeconds(parsed);
      normalizedTokens.push({
        type: "pause",
        value: `<#${formatPauseSeconds(clamped)}#>`,
      });
    }

    cursor = match.index + match[0].length;
  }

  if (cursor < text.length) {
    normalizedTokens.push({
      type: "text",
      value: text.slice(cursor),
    });
  }

  if (normalizedTokens.length === 0) {
    return text;
  }

  const resultTokens: Array<
    { type: "text"; value: string } | { type: "pause"; value: string }
  > = [];

  for (let i = 0; i < normalizedTokens.length; i++) {
    const token = normalizedTokens[i];
    if (token.type !== "pause") {
      resultTokens.push(token);
      continue;
    }

    const prev = normalizedTokens[i - 1];
    const next = normalizedTokens[i + 1];
    const hasPrevSpeakable =
      prev?.type === "text" && hasSpeakableText(prev.value);
    const hasNextSpeakable =
      next?.type === "text" && hasSpeakableText(next.value);
    const isConsecutivePause =
      resultTokens[resultTokens.length - 1]?.type === "pause";

    if (!hasPrevSpeakable || !hasNextSpeakable || isConsecutivePause) {
      continue;
    }

    resultTokens.push(token);
  }

  return resultTokens.map((token) => token.value).join("");
}

export function stripPauseMarkersForNonMinimax(text: string): string {
  return text.replace(PAUSE_TAG_REGEX, "");
}

export function normalizeMinimaxSpeechText(
  text: string,
  model: MinimaxSpeechModel,
): string {
  let normalized = sanitizePauseMarkers(text);

  if (!supportsMinimaxEmotionTag(model)) {
    normalized = normalized.replace(EMOTION_TAG_REGEX, "");
  }

  if (!hasSpeakableText(normalized)) {
    throw new Error("文本标准化后不包含可发音内容，请调整文本后重试");
  }

  return normalized;
}

export function buildMinimaxSpeechPromptRules(
  isMinimax: boolean,
  model: MinimaxSpeechModel,
): string {
  if (!isMinimax) {
    return `TTS tags rule:
- Output plain spoken text only.
- Do not output pause tags like <#1.2#>.
- Do not output any parenthesized emotion tags.`;
  }

  if (supportsMinimaxEmotionTag(model)) {
    return `TTS tags rule:
- Pause tags are allowed: <#x#>, x in [0.01, 99.99], up to 2 decimals, and must appear between speakable text.
- Emotion tags are allowed only from this whitelist: ${MINIMAX_EMOTION_TAGS.join(", ")}.
- Do not output any other parenthesized emotion tag.`;
  }

  return `TTS tags rule:
- Pause tags are allowed: <#x#>, x in [0.01, 99.99], up to 2 decimals, and must appear between speakable text.
- Do not output any parenthesized emotion tags.`;
}

export function isOfficialMinimaxEmotionTag(tag: string): boolean {
  return EMOTION_TAG_SET.has(tag);
}
