import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import { mindMapMessages, sidebarMessages } from "./sidebar.messages";
export function useSidebarI18n() {
  return useI18n(sidebarMessages, desktopI18n);
}
export function useMindMapI18n() {
  return useI18n(mindMapMessages, desktopI18n);
}
