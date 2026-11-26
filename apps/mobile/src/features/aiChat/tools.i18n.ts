import { useI18n } from "@tau/i18n/react";
import { mobileI18n } from "../../services/i18n";
import { toolMessages } from "./tools.messages";
export function useToolsI18n() {
  return useI18n(toolMessages, mobileI18n);
}
