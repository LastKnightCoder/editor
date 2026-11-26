import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import { projectVideoMessages } from "./messages";
export function useProjectVideoI18n() {
  return useI18n(projectVideoMessages, desktopI18n);
}
