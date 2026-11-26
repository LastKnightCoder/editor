import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n as runtime } from "@/app/i18n/runtime";
import zhCN from "./locales/voice.zh-CN.json";
import zhTW from "./locales/voice.zh-TW.json";
import enUS from "./locales/voice.en-US.json";

export const voiceSettingsMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type VoiceSettingsMessageKey = Parameters<typeof voiceSettingsMessages.ref>[0];
export const voiceSettingsTranslator = runtime.get(voiceSettingsMessages);
export const voiceText = voiceSettingsTranslator.t;
export function useVoiceSettingsI18n() {
  return useI18n(voiceSettingsMessages, runtime);
}
const formats = new Map<string, Intl.NumberFormat>();
export function voiceValue(value: unknown): string {
  if (typeof value !== "number") return String(value);
  const locale = runtime.getSnapshot();
  let format = formats.get(locale);
  if (!format) {
    format = new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 20 });
    formats.set(locale, format);
  }
  return format.format(value);
}
