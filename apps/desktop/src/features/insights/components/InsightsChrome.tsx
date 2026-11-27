import { Loader2, Sparkles } from "lucide-react";
import { Button, cn } from "@tau/ui";
import type { InsightsViewOptions } from "../useInsightsView";
import { useInsightsI18n } from "../i18n";

export function InsightsModeButton({
  view,
  copy,
  hasOpen,
  toggle,
}: {
  view: "off" | "reading" | "on";
  copy: InsightsViewOptions["copy"];
  hasOpen: boolean;
  toggle(): void;
}) {
  const { t } = useInsightsI18n();
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={view === "reading"}
      title={view === "off" ? (copy?.title ?? t("insights.enterHint")) : t("insights.exitHint")}
      className={cn(
        "text-tau-meta text-ink-2 hover:bg-hover hover:text-ink-1 inline-flex h-[22px] shrink-0 items-center gap-[5px] rounded-full px-2 transition-colors",
        view !== "off" &&
          "bg-accent-soft text-accent-text hover:bg-accent-soft hover:text-accent-text"
      )}
    >
      {view === "reading" ? (
        <Loader2 className="size-[13px] animate-spin" strokeWidth={1.75} />
      ) : (
        <Sparkles className="size-[13px]" strokeWidth={1.75} />
      )}
      {view === "reading"
        ? t("insights.reading")
        : view === "on"
          ? copy
            ? t("insights.hideMarks")
            : t("insights.exit")
          : (copy?.label ?? t("insights.title"))}
      {view === "off" && hasOpen && <i className="bg-accent size-[5px] rounded-full opacity-70" />}
    </button>
  );
}
export function InsightsWalkBar({
  index,
  total,
  end,
}: {
  index: number;
  total: number;
  end(): void;
}) {
  const { t } = useInsightsI18n();
  return (
    <div className="bg-surface shadow-float text-tau-meta text-ink-2 fixed bottom-6 left-1/2 z-[240] flex -translate-x-1/2 items-center gap-2.5 rounded-full py-1.5 pr-2 pl-4">
      <span className="text-ink-1 tabular-nums">
        {index} / {total}
      </span>
      <span className="text-ink-3 text-[11px]">{t("insights.walkKeys")}</span>
      <Button size="sm" variant="secondary" onClick={end}>
        {t("insights.end")}
      </Button>
    </div>
  );
}
