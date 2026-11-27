import { defineI18n, type Translator, type TranslationValues } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import type { InsightKind, ContentInsightsPhase } from "@/types/content-insights";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";
export const insightsMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const insightsTranslator = desktopI18n.get(insightsMessages);
export type InsightsTranslate = Translator<Parameters<typeof insightsMessages.ref>[0]>["t"];
export function useInsightsI18n() {
  return useI18n(insightsMessages, desktopI18n);
}
export function insightKindLabel(kind: InsightKind, t: InsightsTranslate) {
  return t(`insights.kind.${kind}`);
}
export function insightsFeedback(
  key: Parameters<InsightsTranslate>[0],
  values?: TranslationValues
) {
  const params = values && Object.freeze({ ...values });
  return () => insightsTranslator.t(key, params);
}
export function insightsFailure(key: Parameters<InsightsTranslate>[0], error: unknown) {
  const raw = error instanceof Error ? error.message : undefined;
  return () => raw ?? insightsTranslator.t(key);
}
export function insightPhaseText(
  phase: ContentInsightsPhase | null,
  locale: string,
  t: InsightsTranslate
) {
  if (phase?.phase === "candidates")
    return t("insights.phase.candidates", {
      notes: phase.notes.toLocaleString(locale),
      candidates: phase.candidates,
    });
  return t(phase?.phase === "thinking" ? "insights.phase.thinking" : "insights.phase.pending");
}
export function insightTime(time: number, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(time);
}
