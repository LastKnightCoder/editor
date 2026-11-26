import { createI18nRuntime, createLocaleStore, defineI18n, resolveLocale } from "@tau/i18n";
import { useI18n, useI18nRuntime } from "@tau/i18n/react";
import zhCN from "./locales/message.zh-CN.json";
import zhTW from "./locales/message.zh-TW.json";
import enUS from "./locales/message.en-US.json";
export const chatUiMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
const standalone = createI18nRuntime({ localeSource: createLocaleStore("zh-CN") });
const locales = Object.keys(chatUiMessages.resources);
const translators = Object.fromEntries(
  locales.map(locale => [
    locale,
    createI18nRuntime({ localeSource: createLocaleStore(locale) }).get(chatUiMessages),
  ])
);
export function resolveChatUiLocale(locale: string) {
  return resolveLocale(locale, locales, chatUiMessages.fallbackLocale);
}
export function chatUiTranslator(locale = "zh-CN") {
  return translators[resolveChatUiLocale(locale)];
}
export function useChatUiI18n() {
  return useI18n(chatUiMessages, useI18nRuntime() ?? standalone);
}
