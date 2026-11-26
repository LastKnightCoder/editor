import { useI18n } from "@tau/i18n/react";
import { whiteboardMessages } from "./messages";
import { useWhiteboardI18nRuntime } from "./i18n-context";
export { useWhiteboardI18nRuntime } from "./i18n-context";
export function useWhiteboardI18n() {
  return useI18n(whiteboardMessages, useWhiteboardI18nRuntime());
}
