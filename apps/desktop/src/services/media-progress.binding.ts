import type { MediaProgress } from "../../shared/media-progress";
import { desktopI18n } from "@/app/i18n/runtime";
import { mediaProgressMessages } from "./media-progress.messages";

export const mediaProgressT = desktopI18n.get(mediaProgressMessages).t;

/** Unknown codes and provider messages remain opaque. */
export function mediaProgressText(
  progress: MediaProgress | null | undefined,
  fallback = ""
): string {
  if (!progress) return fallback;
  const t = mediaProgressT;
  const number = (value: number, digits?: number) =>
    value.toLocaleString(desktopI18n.getSnapshot(), {
      useGrouping: false,
      ...(digits === undefined
        ? {}
        : { minimumFractionDigits: digits, maximumFractionDigits: digits }),
    });
  const param = (key: string) => progress.params?.[key];
  const percent =
    typeof param("percent") === "number"
      ? (param("percent") as number)
      : (progress.percent ??
        progress.progress ??
        (progress.fraction === undefined ? undefined : progress.fraction * 100));
  switch (progress.code) {
    case "transcription.audio.prepare":
      return t("asr.prepare");
    case "transcription.recognizing":
      if (percent !== undefined) return t("asr.recognizing", { percent: number(percent) });
      break;
    case "transcription.gpu":
      if (typeof param("device") === "string")
        return t("asr.device", { device: param("device") as string });
      break;
    case "transcription.qwen":
      return t("asr.qwen");
    case "transcription.segments.prepare":
    case "transcription.segments.ready":
    case "transcription.segments.done": {
      const current = param("current"),
        total = param("total");
      if (typeof current === "number" && typeof total === "number") {
        const key =
          progress.code === "transcription.segments.prepare"
            ? "segments.prepare"
            : progress.code === "transcription.segments.ready"
              ? "segments.ready"
              : "segments.done";
        return t(key, { current: number(current), total: number(total) });
      }
      break;
    }
    case "transcription.segments.merge":
      return t("segments.merge");
    case "video.downloading":
      return t("video.downloading", {
        percent: percent === undefined ? "" : ` ${number(Math.round(percent))}%`,
      });
    case "video.tracks.downloading":
      return t("video.tracks");
    case "video.merge":
      return t("video.merge");
    case "video.ready":
      return t("video.ready");
    case "video.remote.start":
      return t("video.start");
    case "video.remote.downloading":
      if (percent !== undefined)
        return t("video.remoteProgress", { percent: number(Number(percent.toFixed(1)), 1) });
      break;
    case "video.remote.completed":
    case "video.remote.cached": {
      const bytes = param("fileSize");
      if (typeof bytes === "number")
        return t(progress.code === "video.remote.cached" ? "video.cached" : "video.complete", {
          size: number(Number((bytes / 1024 / 1024).toFixed(2)), 2),
        });
      break;
    }
    case "video.remote.error":
      if (typeof param("error") === "string")
        return t("video.error", { error: param("error") as string });
      break;
    case "video.track.downloading":
    case "video.track.completed": {
      const track = param("track");
      if (track === "video" || track === "audio" || track === "all") {
        const label = t(
          track === "video" ? "loader.video" : track === "audio" ? "loader.audio" : "loader.track"
        );
        if (progress.code === "video.track.completed")
          return t("video.trackComplete", { track: label });
        if (percent !== undefined)
          return t("video.trackProgress", {
            track: label,
            percent: number(Number(percent.toFixed(1)), 1),
          });
      }
      break;
    }
    case "video.source.preparing":
      return t("source.preparing");
    case "video.source.info":
      return t("source.info");
  }
  return progress.message || fallback;
}
