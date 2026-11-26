import { useI18n } from "@tau/i18n/react";
import { appMessages } from "./messages";
import { desktopI18n } from "./runtime";

export function useAppI18n() {
  return useI18n(appMessages, desktopI18n);
}
