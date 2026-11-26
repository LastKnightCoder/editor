import { FlashcardsError } from "./errors";
import { defineI18n, type TranslationValues } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";

export const flashcardsMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type FlashcardsMessageKey = Parameters<typeof flashcardsMessages.ref>[0];
export const flashcardsTranslator = desktopI18n.get(flashcardsMessages);
export function useFlashcardsI18n() {
  return useI18n(flashcardsMessages, desktopI18n);
}

export function flashcardsCount(
  key: FlashcardsMessageKey,
  count: number,
  values: TranslationValues = {}
): string {
  return flashcardsTranslator.t(key, {
    ...values,
    count,
    amount: count.toLocaleString(desktopI18n.getSnapshot()),
  });
}
export function flashcardsDisplayContext() {
  return { locale: desktopI18n.getSnapshot(), t: flashcardsTranslator.t };
}
export function flashcardsErrorText(error: unknown): string {
  return error instanceof FlashcardsError
    ? flashcardsTranslator.t(
        error.messageKey,
        error.cause === undefined ? undefined : { reason: flashcardsErrorText(error.cause) }
      )
    : error instanceof Error
      ? error.message
      : String(error);
}
