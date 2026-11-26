import { useI18n } from "@tau/i18n/react";
import { mobileI18n } from "../../services/i18n";
import { askMessages } from "./askMessages";
export type { SuggestionKey } from "./askMessages";
export function useAskI18n() {
  return useI18n(askMessages, mobileI18n);
}
