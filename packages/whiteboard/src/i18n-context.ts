import { useI18nRuntime } from "@tau/i18n/react";
import { standaloneWhiteboardI18n } from "./locale-runtime";
export function useWhiteboardI18nRuntime() {
  return useI18nRuntime() ?? standaloneWhiteboardI18n;
}
