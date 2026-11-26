import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import { walkMessages } from "./messages";

export const walkTranslator = desktopI18n.get(walkMessages);

export function useWalkI18n() {
  return useI18n(walkMessages, desktopI18n);
}
