import { defineI18n, type Translator, type TranslationValues } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/file.zh-CN.json";
import zhTW from "./locales/file.zh-TW.json";
import enUS from "./locales/file.en-US.json";
export const markdownFileMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const markdownFileTranslator = desktopI18n.get(markdownFileMessages);
export type MarkdownFileTranslate = Translator<Parameters<typeof markdownFileMessages.ref>[0]>["t"];
export function useMarkdownFileI18n() {
  return useI18n(markdownFileMessages, desktopI18n);
}
export function markdownFileFeedback(
  key: Parameters<MarkdownFileTranslate>[0],
  values?: TranslationValues
) {
  const params = values && Object.freeze({ ...values });
  const getMessage = () => markdownFileTranslator.t(key, params);
  return [getMessage(), { getMessage }] as const;
}
