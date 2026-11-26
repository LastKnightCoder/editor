import type { AppUpdateFailure } from "./errors";
import { defineI18n, type TranslationValues } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { mobileI18n } from "../../../services/i18n";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";
export const aboutMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type AboutMessageKey = Parameters<typeof aboutMessages.ref>[0];
export type AboutLocale = {
  locale: string;
  t: (key: AboutMessageKey, values?: TranslationValues) => string;
};
export const aboutTranslator = mobileI18n.get(aboutMessages);
export function useAboutI18n() {
  return useI18n(aboutMessages, mobileI18n);
}
export function aboutDisplayContext() {
  return { locale: mobileI18n.getSnapshot(), t: aboutTranslator.t };
}

const UPDATE_ERROR_KEYS: Readonly<Record<string, AboutMessageKey>> = {
  APP_UPDATE_NETWORK: "error.network",
  APP_UPDATE_MANIFEST_INVALID: "error.manifest",
  APP_UPDATE_CORRUPT: "error.corrupt",
  APP_UPDATE_STORAGE: "error.storage",
  APP_UPDATE_BUSY: "error.busy",
  APP_UPDATE_NOT_DOWNLOADED: "error.notDownloaded",
  APP_UPDATE_INSTALL_FAILED: "error.install",
  APP_UPDATE_UNSUPPORTED: "error.unsupported",
};
export function updateErrorText(failure: AppUpdateFailure): string {
  const key = UPDATE_ERROR_KEYS[failure.code];
  return key ? aboutTranslator.t(key) : failure.diagnostic || aboutTranslator.t("error.failed");
}
