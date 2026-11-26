import { StorageNotReadyError } from "./errors";
import { uploadFailureText } from "../../../services/uploadOutcome.i18n";
import { defineI18n, type TranslationValues } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { mobileI18n } from "../../../services/i18n";
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
export const storageTranslator = mobileI18n.get(storageMessages);
export function useStorageI18n() {
  return useI18n(storageMessages, mobileI18n);
}
export function storageDisplayContext(): StorageLocale {
  return { locale: mobileI18n.getSnapshot(), t: storageTranslator.t };
}

export function storageErrorText(error: unknown): string {
  return error instanceof StorageNotReadyError
    ? storageTranslator.t("provider.notReady")
    : uploadFailureText(error);
}
