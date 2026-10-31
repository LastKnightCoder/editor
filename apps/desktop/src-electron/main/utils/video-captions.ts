import type { VideoCaptions } from "@tau/plugins";

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
    const languages = Object.entries(tracks ?? {})
      .filter(([, formats]) => formats.some(format => format.ext === "json3" && format.url))
      .map(([language]) => language);
    const language =
      languages.find(value => value === `${info.language}-orig`) ??
      languages.find(value => value === info.language) ??
      languages.find(value => value.endsWith("-orig")) ??
      languages.find(value => value === "en") ??
      languages[0];
    if (language) return { language, automatic };
  }
  return null;
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
