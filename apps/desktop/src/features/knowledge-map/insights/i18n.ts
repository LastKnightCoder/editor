import { defineI18n, type Translator, type TranslationValues } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import type {
  KnowledgeEndpoint,
  KnowledgeInsightsPhase,
  KnowledgeMark,
  KnowledgeMarkKind,
} from "@/types/knowledge-insights";
import { stripGapPrefix } from "./model";
import zhCN from "../locales/insights.zh-CN.json";
import zhTW from "../locales/insights.zh-TW.json";
import enUS from "../locales/insights.en-US.json";
export const mapInsightsMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const mapInsightsTranslator = desktopI18n.get(mapInsightsMessages);
export type InsightsTranslate = Translator<Parameters<typeof mapInsightsMessages.ref>[0]>["t"];
export function useMapInsightsI18n() {
  return useI18n(mapInsightsMessages, desktopI18n);
}
export function insightKindLabel(kind: KnowledgeMarkKind, t: InsightsTranslate) {
  return t(`insights.kind.${kind}`);
}
export function insightRefLabel(kind: KnowledgeEndpoint["ref"]["kind"], t: InsightsTranslate) {
  return t(`insights.ref.${kind}`);
}
export function insightsFeedback(
  key: Parameters<InsightsTranslate>[0],
  values?: TranslationValues
) {
  const parameters = values && Object.freeze({ ...values });
  const getMessage = () => mapInsightsTranslator.t(key, parameters);
  return [getMessage(), { getMessage }] as const;
}
export function insightsFailure(key: Parameters<InsightsTranslate>[0], error: unknown) {
  const getMessage = () => (error instanceof Error ? error.message : mapInsightsTranslator.t(key));
  return [getMessage(), { getMessage }] as const;
}
export function insightSummary(mark: KnowledgeMark, t: InsightsTranslate): string {
  const [a, b] = mark.ends;
  const pair = { a: a?.title ?? "", b: b?.title ?? "" };
  switch (mark.kind) {
    case "bridge":
      return mark.text
        ? t("insights.summary.bridge", { ...pair, text: mark.text })
        : t("insights.summary.bridgeSimple", pair);
    case "dup":
      return t("insights.summary.dup", pair);
    case "conflict":
      return t("insights.summary.conflict", pair);
    case "chain": {
      const index = mark.missing?.index ?? 1;
      const from = mark.ends[index - 1];
      const to = mark.ends[index];
      const missing = mark.missing?.text
        ? t("insights.summary.namedMissing", { text: mark.missing.text })
        : t("insights.summary.missingLink");
      return from && to
        ? t("insights.summary.chain", { from: from.title, to: to.title, missing })
        : t("insights.summary.chainFallback", { missing });
    }
    case "pattern":
      return t("insights.summary.pattern", { count: mark.ends.length, text: mark.text ?? "" });
    case "asked":
      return t("insights.summary.asked", {
        count: mark.prompts?.length ?? 0,
        text: mark.text ?? "",
      });
    case "gap":
    case "thin":
      return t("insights.summary.gap", { text: stripGapPrefix(mark.text ?? "") });
    default:
      return mark.text || mark.why;
  }
}
export function insightPhaseText(
  phase: KnowledgeInsightsPhase | null,
  locale: string,
  t: InsightsTranslate
): string {
  if (phase?.phase === "reading")
    return t("insights.phase.reading", {
      notes: phase.notes.toLocaleString(locale),
      topics: phase.topics,
      stale: phase.stale ? t("insights.phase.stale", { count: phase.stale }) : "",
    });
  if (phase?.phase === "topic")
    return t("insights.phase.topic", {
      label: phase.label,
      progress:
        phase.total > 1
          ? t("insights.phase.progress", { index: phase.index, total: phase.total })
          : "",
    });
  return t(phase?.phase === "global" ? "insights.phase.global" : "insights.phase.pending");
}
export function insightDate(time: number, locale: string, withTime = false): string {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    ...(withTime ? ({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" } as const) : {}),
  }).format(time);
}
