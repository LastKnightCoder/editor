import { defineI18n, type TranslationValues } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";
export const pluginMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const pluginTranslator = desktopI18n.get(pluginMessages);
export type PluginMessageKey = Parameters<typeof pluginMessages.ref>[0];
export function usePluginI18n() {
  return useI18n(pluginMessages, desktopI18n);
}
export function pluginNumber(value: number): string {
  return value.toLocaleString(desktopI18n.getSnapshot());
}
export function pluginCount(key: PluginMessageKey, count: number, values: TranslationValues = {}) {
  return pluginTranslator.t(key, { ...values, count, amount: pluginNumber(count) });
}
