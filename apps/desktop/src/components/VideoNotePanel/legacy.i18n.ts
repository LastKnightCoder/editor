import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import { legacyVideoMessages } from "./legacy.messages";
export function useLegacyVideoI18n() {
  return useI18n(legacyVideoMessages, desktopI18n);
}
