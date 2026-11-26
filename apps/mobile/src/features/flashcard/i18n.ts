import { FlashcardError } from "./errors";
import { defineI18n, type TranslationValues } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { mobileI18n } from "../../services/i18n";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";

export const flashcardMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type FlashcardMessageKey = Parameters<typeof flashcardMessages.ref>[0];
export const flashcardTranslator = mobileI18n.get(flashcardMessages);
export function useFlashcardI18n() {
  return useI18n(flashcardMessages, mobileI18n);
}

export function flashcardCount(
  key: FlashcardMessageKey,
  count: number,
  values: TranslationValues = {}
): string {
  return flashcardTranslator.t(key, {
    ...values,
    count,
    amount: count.toLocaleString(mobileI18n.getSnapshot()),
  });
}
export function flashcardDisplayContext() {
  return { locale: mobileI18n.getSnapshot(), t: flashcardTranslator.t };
}
export function flashcardErrorText(error: unknown): string {
  return error instanceof FlashcardError
    ? flashcardTranslator.t(error.messageKey)
    : error instanceof Error
      ? error.message
      : String(error);
}
