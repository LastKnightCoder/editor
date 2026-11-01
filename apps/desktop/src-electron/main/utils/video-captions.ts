import type { VideoCaptions } from "@tau/plugins";

const CAPTION_FORMATS = ["json3", "vtt", "srt"] as const;
type CaptionFormat = (typeof CAPTION_FORMATS)[number];

export interface SubtitleFormat {
  ext?: string;
  url?: string;
}

export interface SubtitleInfo {
  language?: string;
  subtitles?: Record<string, SubtitleFormat[]>;
  automatic_captions?: Record<string, SubtitleFormat[]>;
}

/** 人工字幕优先，同类中优先原语言，避免下载所有翻译轨。 */
export function selectCaptionTrack(info: SubtitleInfo) {
  for (const [automatic, tracks] of [
    [false, info.subtitles],
    [true, info.automatic_captions],
  ] as const) {
    const candidates = Object.entries(tracks ?? {}).flatMap(([language, formats]) => {
      if (language === "live_chat") return [];
      const format = CAPTION_FORMATS.find(ext =>
        formats.some(format => format.ext === ext && format.url)
      );
      return format ? [{ language, format }] : [];
    });
    const languages = candidates.map(track => track.language);
    const language =
      languages.find(value => value === `${info.language}-orig`) ??
      languages.find(value => value === info.language) ??
      languages.find(value => value.endsWith("-orig")) ??
      languages.find(value => value === "en") ??
      languages[0];
    const track = candidates.find(track => track.language === language);
    if (track) return { ...track, automatic };
  }
  return null;
}

export function parseCaptions(
  source: string,
  format: CaptionFormat,
  language: string
): VideoCaptions | null {
  const content = source.replace(/^\uFEFF/, "");
  if (format === "json3") return parseJson3Captions(JSON.parse(content), language);
  const segments = content
    .replace(/\r\n?/g, "\n")
    .split(/\n[\t ]*\n+/)
    .flatMap(block => {
      const lines = block.trim().split("\n");
      if (/^(?:WEBVTT|NOTE|STYLE|REGION)(?:\s|$)/.test(lines[0])) return [];
      const timingIndex = lines[0]?.includes("-->") ? 0 : 1;
      const timing = lines[timingIndex]?.match(
        /^((?:\d{2,}:)?\d{2}:\d{2}[.,]\d{3})[\t ]+-->[\t ]+((?:\d{2,}:)?\d{2}:\d{2}[.,]\d{3})(?:[\t ].*)?$/
      );
      if (!timing) return [];
      const start = parseCaptionTimestamp(timing[1]);
      const end = parseCaptionTimestamp(timing[2]);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end <= start) return [];
      const text = captionText(lines.slice(timingIndex + 1).join("\n"));
      return text ? [{ text, start, end }] : [];
    })
    .sort((a, b) => a.start - b.start);
  return segments.length ? { language: language.replace(/-orig$/, ""), segments } : null;
}

function parseCaptionTimestamp(value: string): number {
  const parts = value.replace(",", ".").split(":");
  const seconds = Number(parts.pop());
  const minutes = Number(parts.pop());
  const hours = Number(parts.pop() ?? 0);
  if (minutes >= 60 || seconds >= 60) return NaN;
  return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
}

const CAPTION_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  nbsp: " ",
  lrm: "\u200e",
  rlm: "\u200f",
  quot: '"',
  apos: "'",
};

function captionText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^<>]*>/g, "")
    .replace(/\{\\[^}]*\}/g, "")
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
      if (!name.startsWith("#"))
        return Object.hasOwn(CAPTION_ENTITIES, name) ? CAPTION_ENTITIES[name] : entity;
      const code =
        name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
        ? String.fromCodePoint(code)
        : entity;
    })
    .replace(/\s+/g, " ")
    .trim();
}

export function parseJson3Captions(value: unknown, language: string): VideoCaptions | null {
  const events = (value as { events?: unknown })?.events;
  if (!Array.isArray(events)) throw new Error("字幕数据无效");
  const segments = events
    .flatMap(event => {
      if (!event || !Array.isArray(event.segs)) return [];
      const text = event.segs
        .map((part: { utf8?: unknown }) => (typeof part?.utf8 === "string" ? part.utf8 : ""))
        .join("")
        .replace(/\s+/g, " ")
        .trim();
      const start = event.tStartMs;
      const duration = event.dDurationMs;
      if (
        !text ||
        !Number.isFinite(start) ||
        start < 0 ||
        !Number.isFinite(duration) ||
        duration <= 0
      )
        return [];
      return [{ text, start, end: start + duration }];
    })
    .sort((a, b) => a.start - b.start);
  return segments.length ? { language: language.replace(/-orig$/, ""), segments } : null;
}
