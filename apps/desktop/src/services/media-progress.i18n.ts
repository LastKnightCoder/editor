import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import { mediaProgressMessages } from "./media-progress.messages";
export function useMediaProgressI18n() {
  return useI18n(mediaProgressMessages, desktopI18n);
}
