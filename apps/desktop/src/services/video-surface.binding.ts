import { desktopI18n } from "@/app/i18n/runtime";
import { videoSurfaceMessages } from "./video-surface.messages";
import { VideoProviderMissing } from "./video-source-error";
export const videoSurfaceT = desktopI18n.get(videoSurfaceMessages).t;
export function videoSourceFailureText(error: unknown): string {
  return error instanceof VideoProviderMissing
    ? videoSurfaceT("source.providerMissing", { provider: error.providerId })
    : error instanceof Error
      ? error.message
      : String(error);
}
