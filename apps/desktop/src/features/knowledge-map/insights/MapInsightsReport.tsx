/**
 * 洞见视图地图右侧的侧栏：版图（或这个主题）两三句、各类数量（点了跳到第一处）、
 * 每季度新写的生长条、可以继续想的问题。读的过程中只显示真实的阶段说明。
 * 有发现的主题用菜单切换：全局层是「有发现的主题 N」签，主题层是顶部「全部主题 › 主题名」里的主题名。
 * 竖着放，不占地图的高度。
 */

import { useState, type ReactElement } from "react";
import {
  ChevronDown,
  ChevronRight,
  CircleHelp,
  ListChecks,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button, Menu, cn } from "@tau/ui";
import type { InsightAsk } from "@/types/content-insights";
import type {
  KnowledgeInsightNode,
  KnowledgeInsightsPhase,
  KnowledgeMarkKind,
} from "@/types/knowledge-insights";
import { KIND_ORDER, MARK_META, openMarks, type FindingTopic } from "./model";

export interface MapInsightsReportProps {
  node: KnowledgeInsightNode | null;
  reading: boolean;
  phase: KnowledgeInsightsPhase | null;
  /** 主题层：主题名；全局层为 null */
  topicLabel: string | null;
  /** 有还没处理发现的主题，按还剩几处从多到少 */
  findingTopics: FindingTopic[];
  /** 主题层：当前主题 id；全局层为 null */
  currentTopicId: number | null;
  onBack(): void;
  onJumpKind(kind: KnowledgeMarkKind): void;
  onPickTopic(topicId: number): void;
  onAsk(ask: InsightAsk): void;
  onReanalyze(): void;
  onWalk(): void;
}

const PILL =
  "bg-surface-hover text-ink-2 hover:text-ink-1 inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] hover:shadow-[0_0_0_1px_var(--tau-line-1)]";

/** 有发现的主题菜单：当前主题高亮，右边是还剩几处 */
function TopicMenu({
  topics,
  currentTopicId,
  onPick,
  trigger,
}: {
  topics: FindingTopic[];
  currentTopicId: number | null;
  onPick(topicId: number): void;
  trigger: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Menu
      open={open}
      onOpenChange={setOpen}
      align="start"
      className="max-h-[360px] w-[220px] overflow-y-auto"
      trigger={trigger}
    >
      {topics.map(topic => (
        <Menu.Item
          key={topic.topicId}
          onSelect={() => onPick(topic.topicId)}
          className={topic.topicId === currentTopicId ? "text-accent-text font-medium" : undefined}
        >
          <span className="flex w-full items-center gap-2" data-map-topic-option={topic.topicId}>
            <span className="min-w-0 flex-1 truncate">{topic.label}</span>
            <span className="text-ink-3 shrink-0 tabular-nums">{topic.open}</span>
          </span>
        </Menu.Item>
      ))}
    </Menu>
  );
}

const ASIDE =
  "border-line-2 animate-fadeIn flex w-[300px] flex-none flex-col overflow-y-auto border-l px-6 py-5";

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

const BAR_WIDTH = 252;

/** 每季度新写的笔记数；最近四季着色，最后一季还没过完 */
function GrowthBars({ counts }: { counts: number[] }) {
  if (!counts.length) return null;
  const max = Math.max(...counts, 1);
  const width = BAR_WIDTH / counts.length;
  const recent = counts.slice(-4).reduce((sum, n) => sum + n, 0);
  return (
    <div>
      <svg viewBox={`0 0 ${BAR_WIDTH} 92`} className="block h-auto w-full" aria-hidden>
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
        <line x1={0} y1={85} x2={BAR_WIDTH} y2={85} stroke="var(--tau-line-2)" />
      </svg>
      <div className="text-ink-3 mt-1 text-[11.5px]">每季度新写的笔记 · 最近一年 {recent}</div>
    </div>
  );
}

export function MapInsightsReport({
  node,
  reading,
  phase,
  topicLabel,
  findingTopics,
  currentTopicId,
  onBack,
  onJumpKind,
  onPickTopic,
  onAsk,
  onReanalyze,
  onWalk,
}: MapInsightsReportProps) {
  if (reading) {
    return (
      <aside className={ASIDE}>
        <div className="text-tau-meta text-ink-3 flex items-start gap-1.5 leading-[1.7]">
          <Loader2 className="mt-[3px] size-[13px] shrink-0 animate-spin" strokeWidth={1.75} />
          {phaseText(phase)}
        </div>
      </aside>
    );
  }
  const open = openMarks(node);
  const counts = new Map<KnowledgeMarkKind, number>();
  for (const mark of open) counts.set(mark.kind, (counts.get(mark.kind) ?? 0) + 1);
  const asks = node?.result.asks ?? [];

  return (
    <aside className={ASIDE} data-map-insights-report>
      <div className="min-w-0">
        {topicLabel && (
          <div className="text-ink-3 mb-1 flex items-center gap-1 text-[12px]">
            <button type="button" onClick={onBack} className="text-accent-text hover:underline">
              全部主题
            </button>
            <ChevronRight className="size-3" strokeWidth={1.75} />
            {findingTopics.some(topic => topic.topicId !== currentTopicId) ? (
              <TopicMenu
                topics={findingTopics}
                currentTopicId={currentTopicId}
                onPick={onPickTopic}
                trigger={
                  <button
                    type="button"
                    title="切换到其他有发现的主题"
                    className="hover:text-ink-1 inline-flex min-w-0 items-center gap-0.5"
                  >
                    <span className="truncate">{topicLabel}</span>
                    <ChevronDown className="size-3 shrink-0" strokeWidth={1.75} />
                  </button>
                }
              />
            ) : (
              <span className="truncate">{topicLabel}</span>
            )}
          </div>
        )}
        <p className="text-ink-1 text-[14px] leading-[1.8]">
          {node?.result.lead || (topicLabel ? "这个主题还没有分析结果。" : "还没有分析结果。")}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {KIND_ORDER.filter(kind => counts.get(kind)).map(kind => (
            <button key={kind} type="button" onClick={() => onJumpKind(kind)} className={PILL}>
              <i className={cn("size-[7px] rounded-full", MARK_META[kind].dot)} />
              {MARK_META[kind].label} {counts.get(kind)}
            </button>
          ))}
          {!topicLabel && findingTopics.length > 0 && (
            <TopicMenu
              topics={findingTopics}
              currentTopicId={null}
              onPick={onPickTopic}
              trigger={
                <button type="button" className={PILL}>
                  <i className="bg-accent size-[7px] rounded-full" />
                  有发现的主题 {findingTopics.length}
                  <ChevronDown className="size-3" strokeWidth={1.75} />
                </button>
              }
            />
          )}
          {!open.length && !(!topicLabel && findingTopics.length) && (
            <span className="bg-surface-hover text-ink-3 inline-flex h-6 items-center rounded-full px-2.5 text-[12px]">
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
        {open.length > 0 && (
          <Button
            size="sm"
            variant="secondary"
            icon={ListChecks}
            block
            className="mt-3"
            onClick={onWalk}
          >
            逐条看
          </Button>
        )}
      </div>
      {node?.result.growth?.length ? (
        <div className="border-line-2 mt-4 border-t pt-3">
          <GrowthBars counts={node.result.growth} />
        </div>
      ) : null}
      <div className="text-ink-3 mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-4 text-[12px]">
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
      </div>
    </aside>
  );
}
