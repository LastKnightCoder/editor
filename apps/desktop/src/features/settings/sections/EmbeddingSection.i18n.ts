import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n as runtime } from "@/app/i18n/runtime";
import zhCN from "./locales/embedding.zh-CN.json";
import zhTW from "./locales/embedding.zh-TW.json";
import enUS from "./locales/embedding.en-US.json";

export const embeddingSettingsMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type EmbeddingSettingsMessageKey = Parameters<typeof embeddingSettingsMessages.ref>[0];
export const embeddingSettingsTranslator = runtime.get(embeddingSettingsMessages);
export const embeddingText = embeddingSettingsTranslator.t;
export function useEmbeddingSettingsI18n() {
  return useI18n(embeddingSettingsMessages, runtime);
}
const numbers = new Map<string, Intl.NumberFormat>();
export function embeddingValue(value: unknown): string {
  if (typeof value !== "number") return String(value);
  const locale = runtime.getSnapshot();
  let format = numbers.get(locale);
  if (!format) {
    format = new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 20 });
    numbers.set(locale, format);
  }
  return format.format(value);
}
