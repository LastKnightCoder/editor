import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import { executionMessages } from "./execution.messages";
export function usePublishExecutionI18n() {
  return useI18n(executionMessages, desktopI18n);
}
