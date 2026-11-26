import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { mobileI18n } from "../../../services/i18n";
import { parseInvokeError } from "../../../services/errors";
import type { ReadingFontId } from "./fonts";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const readingFontTranslator = mobileI18n.get(messages);
export function useReadingFontI18n() {
  return useI18n(messages, mobileI18n);
}
export function readingFontDisplayName(id: ReadingFontId): string {
  return readingFontTranslator.t(`font.${id}.label`);
}
const ERROR_KEYS: Partial<Record<string, Parameters<typeof messages.ref>[0]>> = {
  READING_FONT_NETWORK: "error.network",
  READING_FONT_MANIFEST_INVALID: "error.manifest",
  READING_FONT_NOT_FOUND: "error.notFound",
  READING_FONT_CORRUPT: "error.corrupt",
  READING_FONT_STORAGE: "error.storage",
  READING_FONT_BUSY: "error.busy",
  READING_FONT_NOT_INSTALLED: "error.notInstalled",
};
export function readingFontErrorText(error: unknown): string {
  const code = parseInvokeError(error).code;
  const key = Object.hasOwn(ERROR_KEYS, code) ? ERROR_KEYS[code] : undefined;
  if (key) return readingFontTranslator.t(key);
  const diagnostic =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return diagnostic || readingFontTranslator.t("error.download");
}
