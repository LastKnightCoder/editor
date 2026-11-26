import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import { mcpListMessages } from "./list.messages";
export function useMcpListI18n() {
  return useI18n(mcpListMessages, desktopI18n);
}
