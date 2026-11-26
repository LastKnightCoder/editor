import { defineI18n, type Translator, type TranslationValues } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/chrome.zh-CN.json";
import zhTW from "./locales/chrome.zh-TW.json";
import enUS from "./locales/chrome.en-US.json";
export const markdownChromeMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const markdownChromeTranslator = desktopI18n.get(markdownChromeMessages);
export type MarkdownChromeTranslate = Translator<
  Parameters<typeof markdownChromeMessages.ref>[0]
>["t"];
export function useMarkdownChromeI18n() {
  return useI18n(markdownChromeMessages, desktopI18n);
}
export function markdownChromeFeedback(
  key: Parameters<MarkdownChromeTranslate>[0],
  values?: TranslationValues
) {
  const parameters = values && Object.freeze({ ...values });
  const getMessage = () => markdownChromeTranslator.t(key, parameters);
  return [getMessage(), { getMessage }] as const;
}
