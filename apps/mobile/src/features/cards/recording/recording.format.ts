import type { RecordingState } from "./recordingSession";
import type { TranscriptionUnavailable } from "./transcription";
import { audioLimitParts, RecordingFailure } from "./recording-errors";
import type { RecordingDisplayContext, RecordingMessageKey } from "./recording.messages";

export function formatRecordingTime(ms: number, locale: string): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const number = (value: number) => value.toLocaleString(locale, { useGrouping: false });
  const pad = (value: number) => number(value).padStart(2, number(0));
  return h > 0 ? `${number(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function formatRecordingLimit(ms: number, context: RecordingDisplayContext) {
  const { unit, amount } = audioLimitParts(ms);
  return context.t(`duration.${unit}`, {
    count: amount,
    number: amount.toLocaleString(context.locale),
  });
}

export function discardConfirmText(state: RecordingState, context: RecordingDisplayContext) {
  const count = Math.max(1, Math.round(state.elapsedMs / 60000));
  const duration = context.t("duration.minutes", {
    count,
    number: count.toLocaleString(context.locale),
  });
  return context.t("discard.hint", { duration });
}

export function formatRecordingSize(bytes: number, locale: string) {
  const gb = bytes >= 1024 * 1024 * 1024;
  const value = Number((bytes / (gb ? 1024 * 1024 * 1024 : 1024 * 1024)).toFixed(1));
  return `${value.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false })} ${gb ? "GB" : "MB"}`;
}

export function formatRecordingStartedAt(startedAt: number, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(startedAt);
}

export function recordingErrorText(
  error: unknown,
  fallback: RecordingMessageKey,
  context: RecordingDisplayContext
) {
  if (error instanceof RecordingFailure) {
    if (error.details.code === "RECORDING_AUDIO_UNRESOLVED")
      return context.t("error.audioUnresolved");
    return context.t("error.audioTooLong", {
      limit: formatRecordingLimit(error.details.limitMs, context),
    });
  }
  const text = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return text.replace(/^[A-Z_]+:/, "") || context.t(fallback);
}

export function transcriptionUnavailableText(
  value: TranscriptionUnavailable,
  context: RecordingDisplayContext
) {
  if (value.kind === "reason") return value.reason;
  if (value.kind === "diagnostic")
    return recordingErrorText(value.cause, "unavailable.pluginDisabled", context);
  return context.t(`unavailable.${value.kind}`);
}
