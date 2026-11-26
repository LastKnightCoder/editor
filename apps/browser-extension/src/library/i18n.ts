import { defineI18n, type TranslationValues } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { extensionI18n } from "../shared/i18n";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type LibraryKey = Parameters<typeof messages.ref>[0];
export type LibraryLocale = {
  locale: string;
  t(key: LibraryKey, values?: TranslationValues): string;
};
export const libraryTranslator = extensionI18n.get(messages);
export function useLibraryI18n() {
  return useI18n(messages, extensionI18n);
}
export function libraryErrorText(error: unknown, fallback: LibraryKey): string {
  return error instanceof Error
    ? error.message || libraryTranslator.t(fallback)
    : typeof error === "string" && error
      ? error
      : libraryTranslator.t(fallback);
}
