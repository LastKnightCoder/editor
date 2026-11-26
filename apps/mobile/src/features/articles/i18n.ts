import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { mobileI18n } from "../../services/i18n";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";

export const articlesMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type MobileArticlesKey = Parameters<typeof articlesMessages.ref>[0];
export function useMobileArticlesI18n() {
  return useI18n(articlesMessages, mobileI18n);
}

export const articlesTranslator = mobileI18n.get(articlesMessages);
