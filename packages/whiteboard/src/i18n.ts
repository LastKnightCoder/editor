import { useI18n, useI18nRuntime } from "@tau/i18n/react";
import { whiteboardMessages } from "./messages";
import { standaloneWhiteboardI18n } from "./i18n-runtime";

export function useWhiteboardI18nRuntime() {
  return useI18nRuntime() ?? standaloneWhiteboardI18n;
}
export function useWhiteboardI18n() {
  return useI18n(whiteboardMessages, useWhiteboardI18nRuntime());
}
