import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import { mcpFormsMessages } from "./forms.messages";
export function useMcpFormsI18n() {
  return useI18n(mcpFormsMessages, desktopI18n);
}
