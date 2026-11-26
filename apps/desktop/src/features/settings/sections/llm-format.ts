import type { TranslationValues } from "@tau/i18n";
import type { ModelUsageBucket } from "@/types/model-usage";
import { OTHER_KEY, type UsageRangeKey } from "./modelUsageData";
import type { LlmSettingsMessageKey } from "./llm.i18n";
const FEATURES = [
  "assistantMemory",
  "chat",
  "titleSummary",
  "webClip",
  "podcastGeneration",
  "flashcardGeneration",
  "aiJudgement",
  "transcriptionOptimization",
  "speechInputRefinement",
  "videoSummary",
  "videoEbookRewrite",
  "vibeLearningImageDescription",
  "contentMetadata",
  "contentInsights",
  "inlineSuggestion",
  "videoInsights",
  "videoHighlights",
  "topicHighlights",
  "contentPolish",
  "skillDraft",
  "inlineAssistant",
  "subagent",
  "pdfChat",
  "videoNoteChat",
  "vibeLearningChat",
  "browserChat",
  "unknown",
] as const;
const GENERATIONS = [
  "outline",
  "mindmap",
  "highlights",
  "article",
  "quiz",
  "ppt",
  "ppt_edit",
] as const;

export function createLlmSettingsFormatting(
  locale: string,
  t: (key: LlmSettingsMessageKey, values?: TranslationValues) => string
) {
  const formats = new Map<string, Intl.NumberFormat>();
  const number = (value: number, digits?: number, grouping = false) => {
    const key = `${digits ?? "auto"}:${grouping}`;
    let format = formats.get(key);
    if (!format) {
      format = new Intl.NumberFormat(locale, {
        useGrouping: grouping,
        minimumFractionDigits: digits ?? 0,
        maximumFractionDigits: digits ?? 20,
      });
      formats.set(key, format);
    }
    return format.format(value);
  };
  const dates = new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" });
  const times = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const knownFeature = (feature: string) => {
    const key = FEATURES.find(key => key === feature);
    return key ? t(`usage.feature.${key}`) : feature || t("usage.feature.unknown");
  };
  return {
    rangeLabel: (key: UsageRangeKey) => t(`usage.range.${key}`),
    featureLabel(feature: string): string {
      if (feature === OTHER_KEY) return t("usage.other");
      if (feature.startsWith("generation:plugin:"))
        return t("usage.generated", { name: feature.slice("generation:plugin:".length) });
      if (feature.startsWith("generation:")) {
        const task = feature.slice("generation:".length),
          key = GENERATIONS.find(key => key === task);
        return t("usage.generated", { name: key ? t(`usage.generation.${key}`) : task });
      }
      if (feature.startsWith("aiServer:"))
        return t("usage.external", { name: knownFeature(feature.slice("aiServer:".length)) });
      return knownFeature(feature);
    },
    formatCost(value: number): string {
      if (value === 0) return "$0";
      if (value < 0.01) return `$${number(value, 4)}`;
      if (value < 100) return `$${number(value, 2)}`;
      return `$${number(Math.round(value), 0, true)}`;
    },
    formatTokens(value: number): string {
      if (value >= 1_000_000_000) return `${number(value / 1_000_000_000, 2)}B`;
      if (value >= 1_000_000) return `${number(value / 1_000_000, 2)}M`;
      if (value >= 10_000) return `${number(value / 1000, 1)}K`;
      return number(value, undefined, true);
    },
    formatDuration(ms: number | null): string {
      if (ms === null || !Number.isFinite(ms)) return "—";
      if (ms < 1000) return `${number(Math.round(ms))} ms`;
      if (ms < 60_000) return `${number(ms / 1000, 1)} s`;
      return t("usage.durationMinutesSeconds", {
        minutes: number(Math.floor(ms / 60_000)),
        seconds: number(Math.round((ms % 60_000) / 1000)),
      });
    },
    formatBucketLabel(start: number, bucket: ModelUsageBucket): string {
      return bucket === "hour"
        ? `${String(new Date(start).getHours()).padStart(2, "0")}:00`
        : dates.format(start);
    },
    formatEventTime: (ts: number) => `${dates.format(ts)} ${times.format(ts)}`,
  };
}
