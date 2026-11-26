import { useI18n } from "@tau/i18n/react";
import { mobileI18n, mobileMessages } from "./i18n";

export function useMobileI18n() {
  return useI18n(mobileMessages, mobileI18n);
}
