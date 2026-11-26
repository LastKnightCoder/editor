import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import { videoWatchMessages } from "./watch.messages";
export function useVideoWatchI18n() {
  return useI18n(videoWatchMessages, desktopI18n);
}
