import { defineI18n, type TranslationValues } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";
export const cacheMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type CacheMessageKey = Parameters<typeof cacheMessages.ref>[0];
export const cacheTranslator = desktopI18n.get(cacheMessages);
export function useCacheI18n() {
  return useI18n(cacheMessages, desktopI18n);
}
export function cacheCount(key: CacheMessageKey, count: number, values: TranslationValues = {}) {
  return cacheTranslator.t(key, {
    ...values,
    count,
    amount: count.toLocaleString(desktopI18n.getSnapshot()),
  });
}
