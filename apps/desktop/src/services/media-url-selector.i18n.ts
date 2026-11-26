import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import { mediaUrlSelectorMessages } from "./media-url-selector.messages";
export function useMediaUrlSelectorI18n() {
  return useI18n(mediaUrlSelectorMessages, desktopI18n);
}
