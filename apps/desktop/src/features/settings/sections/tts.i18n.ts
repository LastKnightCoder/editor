import { useI18n } from "@tau/i18n/react";
import { desktopI18n as runtime } from "@/app/i18n/runtime";
import { ttsSettingsMessages } from "./tts.messages";
export * from "./tts.binding";
export { ttsSettingsMessages } from "./tts.messages";
export function useTtsSettingsI18n() {
  return useI18n(ttsSettingsMessages, runtime);
}
