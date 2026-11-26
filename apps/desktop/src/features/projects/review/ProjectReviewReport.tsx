import { useProjectsI18n } from "../i18n";
/**
 * 项目回顾的报告卡（右侧当前文档上方）：生长回顾 = 长了什么、新连上哪里、哪里还薄；
 * 结项回顾 = 留下的核心观点（点了打开）、可以归入的进行中项目、还没解决的问题。
 * 右边是会长的小关系图：中间是这个项目，实线是项目外连着的笔记，虚线是可能属于这里的。
 */

import { CircleHelp, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@tau/ui";
import { MiniGraph } from "@/features/insights/components/InsightsReport";
import type { InsightAsk } from "@/types/content-insights";
import type { KnowledgeEndpoint, KnowledgeInsightNode } from "@/types/knowledge-insights";

export interface ProjectReviewReportProps {
  node: KnowledgeInsightNode | null;
  reading: boolean;
  archived: boolean;
  /** 刚引用进来的那一处（小图里那条线画出来） */
  fresh: boolean;
  onOpen(end: KnowledgeEndpoint): void;
  onOpenProject(projectId: number): void;
  onAsk(ask: InsightAsk): void;
  onReview(): void;
}

export function ProjectReviewReport({
  node,
  reading,
  archived,
  fresh,
  onOpen,
  onOpenProject,
  onAsk,
  onReview,
}: ProjectReviewReportProps) {
  const { t, locale } = useProjectsI18n();
  if (reading) {
    return (
      <div className="text-tau-meta text-ink-3 flex h-[34px] flex-none items-center gap-1.5 px-10 pt-3">
        <Loader2 className="size-[13px] animate-spin" strokeWidth={1.75} />
        {t(archived ? "review.loadingFinal" : "review.loadingGrowth")}
      </div>
    );
  }
  if (!node) return null;
  const final = node.reviewKind === "final";
  const marks = node.result.marks;
  const linked = marks.filter(mark => mark.kind === "belong" && mark.status === "linked").length;
  const pending = marks.filter(mark => mark.kind === "belong" && mark.status === "open").length;
  const thin = marks.filter(mark => mark.kind === "thin" && mark.status === "open").length;
  const asks = node.result.asks;

  return (
    <div className="bg-surface-hover rounded-tau-lg animate-fadeIn mx-10 mt-4 flex-none overflow-hidden">
      <div className="grid grid-cols-[1fr_168px] gap-[18px] px-[18px] pt-3.5 pb-3">
        <div className="min-w-0">
          <div className="text-ink-3 mb-1 text-[12px]">
            {t(final ? "review.final" : "review.growth")} ·{" "}
            {new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" }).format(
              node.updateTime
            )}
          </div>
          <p className="text-ink-1 text-[14px] leading-[1.8]">{node.result.lead}</p>
          {!final && (pending > 0 || thin > 0) && (
            <div className="text-ink-3 mt-2 flex flex-wrap gap-1.5 text-[12px]">
              {pending > 0 && (
                <span className="bg-surface inline-flex h-6 items-center gap-1.5 rounded-full px-2.5">
                  <i className="bg-accent size-[7px] rounded-full" />
                  {t("review.belongCount", {
                    count: pending,
                    number: pending.toLocaleString(locale),
                  })}
                </span>
              )}
              {thin > 0 && (
                <span className="bg-surface inline-flex h-6 items-center gap-1.5 rounded-full px-2.5">
                  <i className="bg-ink-3 size-[7px] rounded-full" />
                  {t("review.thinCount", { count: thin, number: thin.toLocaleString(locale) })}
                </span>
              )}
            </div>
          )}
          {final && node.result.refs?.length ? (
            <div className="text-tau-meta mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-ink-3 text-[12px]">{t("review.core")}</span>
              {node.result.refs.map((end, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => onOpen(end)}
                  className="text-accent-text max-w-[220px] truncate hover:underline"
                >
                  《{end.title}》
                </button>
              ))}
            </div>
          ) : null}
          {final && node.result.home && (
            <div className="text-tau-meta mt-1 flex items-center gap-1.5">
              <span className="text-ink-3 text-[12px]">{t("review.home")}</span>
              <button
                type="button"
                onClick={() => {
                  const home = node.result.home;
                  if (home) onOpenProject(home.projectId);
                }}
                className="text-accent-text hover:underline"
              >
                「{node.result.home.title}」
              </button>
            </div>
          )}
          {asks.length > 0 && (
            <div className="border-line-2 mt-2.5 border-t pt-2">
              <div className="text-ink-3 mb-0.5 text-[12px]">
                {t(final ? "review.unsolved" : "review.moreThought")}
              </div>
              {asks.map(ask => (
                <div
                  key={ask.id}
                  className={cn(
                    "group flex items-baseline gap-2 py-[3px] text-[13px]",
                    ask.status === "open" ? "text-ink-1" : "text-ink-3 line-through"
                  )}
                >
                  <CircleHelp
                    className="text-ink-3 size-[13px] shrink-0 translate-y-[2px]"
                    strokeWidth={1.75}
                  />
                  <span className="min-w-0 flex-1">{ask.text}</span>
                  {ask.status === "open" && (
                    <button
                      type="button"
                      onClick={() => onAsk(ask)}
                      className="text-ink-3 hover:text-accent-text shrink-0 text-[12px] opacity-0 group-hover:opacity-100"
                    >
                      {t("review.discuss")}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="text-ink-3 mt-2 flex items-center gap-3 text-[12px]">
            <span>
              {final
                ? t("review.readFinal")
                : t("review.readGrowth", {
                    count: node.result.candidates,
                    number: node.result.candidates.toLocaleString(locale),
                  })}
            </span>
            <button
              type="button"
              onClick={onReview}
              className="hover:text-ink-1 inline-flex items-center gap-1"
            >
              <RefreshCw className="size-3" strokeWidth={1.75} />
              {t("review.again")}
            </button>
          </div>
        </div>
        <MiniGraph known={(node.result.outside ?? 0) + linked} pending={pending} fresh={fresh} />
      </div>
    </div>
  );
}
