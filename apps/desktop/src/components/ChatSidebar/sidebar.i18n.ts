import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import { sidebarMessages } from "./sidebar.messages";
export function useSidebarI18n() {
  return useI18n(sidebarMessages, desktopI18n);
}
