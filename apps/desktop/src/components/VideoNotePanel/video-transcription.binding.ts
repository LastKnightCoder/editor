import type { MediaProgress } from "../../../shared/media-progress";
import { mediaProgressText } from "@/services/media-progress.binding";
import { desktopI18n } from "@/app/i18n/runtime";
import type { checkLLMOptimizationConfig } from "@/utils/transcription";
import { videoTranscriptionMessages } from "./video-transcription.messages";
import { VideoTranscriptionFailure } from "./video-transcription-error";

export const videoTranscriptionT = desktopI18n.get(videoTranscriptionMessages).t;

export type VideoTranscriptionProgress =
  | { kind: "service"; progress: MediaProgress; downloadPercent?: number; download?: true }
  | { kind: "downloading"; percent?: number }
  | { kind: "segmented"; minutes: number }
  | { kind: "preparing" | "extracting" | "checking" | "transcribing" | "optimizing" | "saving" };

export function videoTranscriptionProgressText(value: VideoTranscriptionProgress | null): string {
  if (!value) return "";
  if (value.kind === "service") {
    const fallback = value.download
      ? videoTranscriptionProgressText({ kind: "downloading", percent: value.downloadPercent })
      : "";
    return mediaProgressText(value.progress, fallback);
  }
  const number = (value: number) =>
    value.toLocaleString(desktopI18n.getSnapshot(), { useGrouping: false });
  if (value.kind === "downloading")
    return videoTranscriptionT("progress.downloading", {
      percent: value.percent === undefined ? "" : ` ${number(Math.round(value.percent))}%`,
    });
  if (value.kind === "segmented")
    return videoTranscriptionT("progress.segmented", { minutes: number(value.minutes) });
  return videoTranscriptionT(`progress.${value.kind}`);
}

export function createVideoLlmConfirm(requirement: ReturnType<typeof checkLLMOptimizationConfig>) {
  return {
    get title() {
      return videoTranscriptionT("confirm.title");
    },
    get description() {
      const reason = requirement.reason
        ? videoTranscriptionT(`llm.${requirement.reason}`)
        : String(requirement.message);
      return videoTranscriptionT("confirm.description", { reason });
    },
  };
}

export function videoTranscriptionFailureText(error: unknown): string {
  return error instanceof VideoTranscriptionFailure
    ? videoTranscriptionT(`failure.${error.code}`)
    : String(error);
}
