import { useI18n } from "@tau/i18n/react";
import { mobileI18n as runtime } from "../../../services/i18n";
import { ttsSettingsMessages } from "./messages";
export * from "./binding";
export { ttsSettingsMessages } from "./messages";
export function useTtsSettingsI18n() {
  return useI18n(ttsSettingsMessages, runtime);
}
