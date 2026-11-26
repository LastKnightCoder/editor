import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import { projectWebMessages } from "./messages";
export function useProjectWebI18n() {
  return useI18n(projectWebMessages, desktopI18n);
}
