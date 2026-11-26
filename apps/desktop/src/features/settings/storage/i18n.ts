import { defineI18n, type TranslationValues } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";
export const storageMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type StorageMessageKey = Parameters<typeof storageMessages.ref>[0];
export type StorageLocale = {
  locale: string;
  t(key: StorageMessageKey, values?: TranslationValues): string;
};
export const storageTranslator = desktopI18n.get(storageMessages);
export function useStorageI18n() {
  return useI18n(storageMessages, desktopI18n);
}
export function storageDisplayContext(): StorageLocale {
  return { locale: desktopI18n.getSnapshot(), t: storageTranslator.t };
}
