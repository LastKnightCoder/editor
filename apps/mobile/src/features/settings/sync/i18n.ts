import { defineI18n, type TranslationValues } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { mobileI18n } from "../../../services/i18n";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";
export const syncMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type SyncMessageKey = Parameters<typeof syncMessages.ref>[0];
export type SyncLocale = {
  locale: string;
  t(key: SyncMessageKey, values?: TranslationValues): string;
};
export const syncTranslator = mobileI18n.get(syncMessages);
export function useSyncI18n() {
  return useI18n(syncMessages, mobileI18n);
}
export function syncCount(key: SyncMessageKey, count: number, values: TranslationValues = {}) {
  return syncTranslator.t(key, {
    ...values,
    count,
    amount: count.toLocaleString(mobileI18n.getSnapshot()),
  });
}
export function syncDisplayContext(): SyncLocale {
  return { locale: mobileI18n.getSnapshot(), t: syncTranslator.t };
}
