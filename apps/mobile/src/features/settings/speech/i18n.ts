import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { mobileI18n as runtime } from "../../../services/i18n";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";

export const speechSettingsMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type SpeechSettingsMessageKey = Parameters<typeof speechSettingsMessages.ref>[0];
export const speechSettingsTranslator = runtime.get(speechSettingsMessages);
export const speechText = speechSettingsTranslator.t;
export function useSpeechSettingsI18n() {
  return useI18n(speechSettingsMessages, runtime);
}
const formats = new Map<string, Intl.NumberFormat>();
export function speechValue(value: unknown): string {
  if (typeof value !== "number") return String(value);
  const locale = runtime.getSnapshot();
  let format = formats.get(locale);
  if (!format) {
    format = new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 20 });
    formats.set(locale, format);
  }
  return format.format(value);
}
