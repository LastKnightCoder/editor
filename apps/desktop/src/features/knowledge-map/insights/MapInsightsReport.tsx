/**
 * 洞见视图标题下的报告卡：版图（或这个主题）两三句、各类数量（点了跳到第一处，全局层另有「有发现的主题」）、
 * 每季度新写的生长条、可以继续想的问题。读的过程中只显示一行真实的阶段说明。主题层顶部一行「全部主题 › 主题名」。
 */

import { ChevronRight, CircleHelp, ListChecks, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@tau/ui";
import type { InsightAsk } from "@/types/content-insights";
import type {
  KnowledgeInsightNode,
  KnowledgeInsightsPhase,
  KnowledgeMarkKind,
} from "@/types/knowledge-insights";
import { KIND_ORDER, MARK_META, openMarks } from "./model";

export interface MapInsightsReportProps {
  node: KnowledgeInsightNode | null;
  reading: boolean;
  phase: KnowledgeInsightsPhase | null;
  /** 主题层：主题名；全局层为 null */
  topicLabel: string | null;
  /** 全局层：有发现的主题数 */
  topicsWithFindings: number;
  onBack(): void;
  onJumpKind(kind: KnowledgeMarkKind): void;
  onJumpTopic(): void;
  onAsk(ask: InsightAsk): void;
  onReanalyze(): void;
  onWalk(): void;
}

function phaseText(phase: KnowledgeInsightsPhase | null) {
  if (phase?.phase === "reading") {
    const stale = phase.stale ? `，其中 ${phase.stale} 个有变化要重新读` : "";
    return `按主题读 ${phase.notes.toLocaleString("zh-CN")} 份笔记的要点（${phase.topics} 个主题${stale}）…`;
  }
  if (phase?.phase === "thinking") return "AI 正在判断哪些值得告诉你…";
  return "正在读…";
}

const formatTime = (ts: number) => {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** 每季度新写的笔记数；最近四季着色，最后一季还没过完 */
function GrowthBars({ counts }: { counts: number[] }) {
  if (!counts.length) return null;
  const max = Math.max(...counts, 1);
  const width = 190 / counts.length;
  const recent = counts.slice(-4).reduce((sum, n) => sum + n, 0);
  return (
    <div className="self-center">
      <svg viewBox="0 0 190 92" className="block h-[92px] w-[190px]" aria-hidden>
        {counts.map((count, index) => {
          const height = (count / max) * 76;
          return (
            <rect
              key={index}
              x={index * width + 2}
              y={84 - height}
              width={width - 4}
              height={height}
              rx={2}
              fill={index >= counts.length - 4 ? "var(--tau-accent)" : "var(--tau-line-1)"}
              className="transition-[height,y] duration-500"
            />
          );
        })}
        <line x1={0} y1={85} x2={190} y2={85} stroke="var(--tau-line-2)" />
      </svg>
      <div className="text-ink-3 mt-1 text-center text-[11.5px]">
        每季度新写的笔记 · 最近一年 {recent}
      </div>
    </div>
  );
}

export function MapInsightsReport({
  node,
  reading,
  phase,
  topicLabel,
  topicsWithFindings,
  onBack,
  onJumpKind,
  onJumpTopic,
  onAsk,
  onReanalyze,
  onWalk,
}: MapInsightsReportProps) {
  if (reading) {
    return (
      <div className="text-tau-meta text-ink-3 flex h-[26px] flex-none items-center gap-1.5 px-8">
        <Loader2 className="size-[13px] animate-spin" strokeWidth={1.75} />
        {phaseText(phase)}
      </div>
    );
  }
  const open = openMarks(node);
  const counts = new Map<KnowledgeMarkKind, number>();
  for (const mark of open) counts.set(mark.kind, (counts.get(mark.kind) ?? 0) + 1);
  const asks = node?.result.asks ?? [];

  return (
    <div className="bg-surface-hover rounded-tau-lg animate-fadeIn mx-8 mb-3 flex-none overflow-hidden">
      <div className="grid grid-cols-[1fr_190px] gap-[18px] px-[18px] pb-3 pt-3.5">
        <div className="min-w-0">
          {topicLabel && (
            <div className="text-ink-3 mb-1 flex items-center gap-1 text-[12px]">
              <button type="button" onClick={onBack} className="text-accent-text hover:underline">
                全部主题
              </button>
              <ChevronRight className="size-3" strokeWidth={1.75} />
              <span>{topicLabel}</span>
            </div>
          )}
          <p className="text-ink-1 text-[14px] leading-[1.8]">
            {node?.result.lead || (topicLabel ? "这个主题还没有分析结果。" : "还没有分析结果。")}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {KIND_ORDER.filter(kind => counts.get(kind)).map(kind => (
              <button
                key={kind}
                type="button"
                onClick={() => onJumpKind(kind)}
                className="bg-surface text-ink-2 hover:text-ink-1 inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] hover:shadow-[0_0_0_1px_var(--tau-line-1)]"
              >
                <i className={cn("size-[7px] rounded-full", MARK_META[kind].dot)} />
                {MARK_META[kind].label} {counts.get(kind)}
              </button>
            ))}
            {!topicLabel && topicsWithFindings > 0 && (
              <button
                type="button"
                onClick={onJumpTopic}
                className="bg-surface text-ink-2 hover:text-ink-1 inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] hover:shadow-[0_0_0_1px_var(--tau-line-1)]"
              >
                <i className="bg-accent size-[7px] rounded-full" />
                有发现的主题 {topicsWithFindings}
              </button>
            )}
            {!open.length && !(!topicLabel && topicsWithFindings) && (
              <span className="bg-surface text-ink-3 inline-flex h-6 items-center rounded-full px-2.5 text-[12px]">
                都处理完了
              </span>
            )}
          </div>
          {asks.length > 0 && (
            <div className="border-line-2 mt-2.5 border-t pt-2">
              <div className="text-ink-3 mb-0.5 text-[12px]">可以继续想</div>
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
                      记为问题
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="text-ink-3 mt-2 flex items-center gap-3 text-[12px]">
            {node && (
              <span>
                {formatTime(node.updateTime)} · 读了 {node.result.candidates} 组候选
              </span>
            )}
            <button
              type="button"
              onClick={onReanalyze}
              className="hover:text-ink-1 inline-flex items-center gap-1"
            >
              <RefreshCw className="size-3" strokeWidth={1.75} />
              重新分析
            </button>
            {open.length > 0 && (
              <button
                type="button"
                onClick={onWalk}
                className="text-accent-text ml-auto inline-flex items-center gap-1"
              >
                <ListChecks className="size-3" strokeWidth={1.75} />
                逐条看
              </button>
            )}
          </div>
        </div>
        <GrowthBars counts={node?.result.growth ?? []} />
      </div>
    </div>
  );
}
