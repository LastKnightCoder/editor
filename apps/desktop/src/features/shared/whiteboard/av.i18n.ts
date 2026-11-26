import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import { whiteboardAvMessages } from "./av.messages";
export function useWhiteboardAvI18n() {
  return useI18n(whiteboardAvMessages, desktopI18n);
}
