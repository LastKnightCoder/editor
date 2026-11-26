import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import { videoSelectorMessages } from "./video-selector.messages";
export function useVideoSelectorI18n() {
  return useI18n(videoSelectorMessages, desktopI18n);
}
