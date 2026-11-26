import type { MobileLlmProvider } from "../../../types";
import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { mobileI18n as runtime } from "../../../services/i18n";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";

export const llmSettingsMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type LlmSettingsMessageKey = Parameters<typeof llmSettingsMessages.ref>[0];
export const llmSettingsTranslator = runtime.get(llmSettingsMessages);
export const llmText = llmSettingsTranslator.t;
export function useLlmSettingsI18n() {
  return useI18n(llmSettingsMessages, runtime);
}
const numbers = new Map<string, Intl.NumberFormat>();
export function llmValue(value: unknown): string {
  if (typeof value !== "number") return String(value);
  const locale = runtime.getSnapshot();
  let format = numbers.get(locale);
  if (!format) {
    format = new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 20 });
    numbers.set(locale, format);
  }
  return format.format(value);
}

export function providerSummary(provider: MobileLlmProvider): string {
  const count = llmText("provider.modelCount", { count: llmValue(provider.models.length) });
  if (!provider.configured) return llmText("provider.needsKey", { count });
  return provider.keyHint ? `${count} · …${provider.keyHint}` : count;
}
