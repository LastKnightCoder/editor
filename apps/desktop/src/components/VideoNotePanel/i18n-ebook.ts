import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/ebook.zh-CN.json";
import zhTW from "./locales/ebook.zh-TW.json";
import enUS from "./locales/ebook.en-US.json";
export const ebookMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const ebookTranslator = desktopI18n.get(ebookMessages);
export function useEbookI18n() {
  return useI18n(ebookMessages, desktopI18n);
}
