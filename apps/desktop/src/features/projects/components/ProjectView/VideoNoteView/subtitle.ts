import { type TranscriptSegment } from "@/types";

interface BuildWebVttOptions {
  minDurationMs?: number;
}

const DEFAULT_MIN_DURATION_MS = 500;

const pad = (value: number, length: number) => Math.floor(value).toString().padStart(length, "0");

const normalizeTimestampMs = (value: number) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
};

const normalizeCueText = (text: string) =>
  (text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .join("\n");

export const formatVttTimestamp = (timestampMs: number): string => {
  const totalMs = normalizeTimestampMs(timestampMs);
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);
  const seconds = Math.floor((totalMs % 60000) / 1000);
  const milliseconds = totalMs % 1000;

  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(milliseconds, 3)}`;
};

export const buildWebVtt = (
  segments: TranscriptSegment[],
  options: BuildWebVttOptions = {}
): string => {
  const minDurationMs = Math.max(0, options.minDurationMs ?? DEFAULT_MIN_DURATION_MS);
  const cues: string[] = [];

  segments.forEach((segment, index) => {
    if (!segment) {
      return;
    }

    const text = normalizeCueText(segment.text);
    if (!text) {
      return;
    }

    const start = normalizeTimestampMs(segment.start);
    const rawEnd = normalizeTimestampMs(segment.end);
    const end = rawEnd > start ? rawEnd : start + minDurationMs;

    cues.push(
      `${index + 1}`,
      `${formatVttTimestamp(start)} --> ${formatVttTimestamp(end)}`,
      text,
      ""
    );
  });

  return ["WEBVTT", "", ...cues].join("\n");
};
