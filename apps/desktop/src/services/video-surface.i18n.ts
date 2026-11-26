import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import { videoSurfaceMessages } from "./video-surface.messages";
export function useVideoSurfaceI18n() {
  return useI18n(videoSurfaceMessages, desktopI18n);
}
