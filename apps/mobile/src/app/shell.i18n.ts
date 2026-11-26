import { useI18n } from "@tau/i18n/react";
import { mobileI18n } from "../services/i18n";
import { shellMessages } from "./shell.messages";
export function useShellI18n() {
  return useI18n(shellMessages, mobileI18n);
}
