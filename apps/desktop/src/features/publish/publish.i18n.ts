import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import { publishMessages } from "./publish.messages";
export function usePublishI18n() {
  return useI18n(publishMessages, desktopI18n);
}
