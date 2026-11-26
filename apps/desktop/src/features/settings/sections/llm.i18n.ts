import { createLlmSettingsFormatting } from "./llm-format";
import type { UsageRangeKey } from "./modelUsageData";
import type { ModelUsageBucket } from "@/types/model-usage";
import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n as runtime } from "@/app/i18n/runtime";
import zhCN from "./locales/llm.zh-CN.json";
import zhTW from "./locales/llm.zh-TW.json";
import enUS from "./locales/llm.en-US.json";

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

const formats = new Map<string, ReturnType<typeof createLlmSettingsFormatting>>();
function format() {
  const locale = runtime.getSnapshot();
  let formatter = formats.get(locale);
  if (!formatter) {
    formatter = createLlmSettingsFormatting(locale, llmText);
    formats.set(locale, formatter);
  }
  return formatter;
}
export const llmFormat = {
  featureLabel: (feature: string) => format().featureLabel(feature),
  rangeLabel: (key: UsageRangeKey) => format().rangeLabel(key),
  formatCost: (value: number) => format().formatCost(value),
  formatTokens: (value: number) => format().formatTokens(value),
  formatDuration: (value: number | null) => format().formatDuration(value),
  formatBucketLabel: (start: number, bucket: ModelUsageBucket) =>
    format().formatBucketLabel(start, bucket),
  formatEventTime: (value: number) => format().formatEventTime(value),
};
