import { VideoHostFailure } from "../../shared/video-host-failure";
import { videoHostFailureText } from "./video-host-failure.binding";
import { VideoCacheFailure } from "../../shared/video-cache-failure";
import { videoCacheFailureText } from "./video-cache-failure.binding";
import { desktopI18n } from "@/app/i18n/runtime";
import { videoSurfaceMessages } from "./video-surface.messages";
import { VideoProviderMissing } from "./video-source-error";
export const videoSurfaceT = desktopI18n.get(videoSurfaceMessages).t;
export function videoSourceFailureText(error: unknown): string {
  return error instanceof VideoProviderMissing
    ? videoSurfaceT("source.providerMissing", { provider: error.providerId })
    : error instanceof VideoCacheFailure
      ? videoCacheFailureText(error)
      : error instanceof VideoHostFailure && error.code
        ? videoHostFailureText(error)
        : error instanceof Error
          ? error.message
          : String(error);
}
