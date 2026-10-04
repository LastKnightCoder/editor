/**
 * 点地图上一处标记后的气泡：开头一句直白说出这一处是什么（markSummary），下面一行 AI 给的理由，涉及谁（呼应 / 重复 / 矛盾并排两端，缺一环一条链，
 * 问了没写列出问过的几次），最多两个按钮。逐条看时附一行快捷键提示。
 */

import { Fragment } from "react";
import { ArrowRight, ArrowUpRight, Check, CircleHelp, Link2, X } from "lucide-react";
import { AnchoredPanel, Button, IconButton, cn } from "@tau/ui";
import type { KnowledgeEndpoint, KnowledgeMark } from "@/types/knowledge-insights";
import {
  MARK_META,
  bothCards,
  connectTarget,
  markSummary,
  primaryAction,
  type MarkAction,
} from "./model";

export interface MapInsightPopoverProps {
  mark: KnowledgeMark;
  anchor: HTMLElement | null;
  walking: boolean;
  onConnect(mark: KnowledgeMark): void;
  onQuestion(mark: KnowledgeMark): void;
  /** 知道了：成立、看到了，不再画出（同一思路） */
  onAcknowledge(mark: KnowledgeMark): void;
  onDismiss(mark: KnowledgeMark): void;
  onOpen(end: KnowledgeEndpoint): void;
  placeOf(end: KnowledgeEndpoint): string | null;
  /** 关闭气泡（逐条看时一并结束），与 Esc 第一层相同 */
  onClose(): void;
}

/** 主按钮文案；连接的文案随两端类型变，单独算 */
const ACTION_LABEL: Partial<Record<MarkAction, string>> = {
  acknowledge: "知道了",
  question: "记为问题",
};

const day = (time: number) => {
  const date = new Date(time);
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
};

/**
 * 端框顶部那一行：这篇在哪（卡片 / 文章 / 项目文档 · 项目名）。呼应是跨主题的，再加上所属大主题；
 * 其余类型两端在同一主题里，主题名两边一样，不显示。
 */
function endPlace(
  mark: KnowledgeMark,
  end: KnowledgeEndpoint,
  placeOf: (end: KnowledgeEndpoint) => string | null
) {
  const place = placeOf(end) ?? REF_KIND_LABEL[end.ref.kind];
  const topic = mark.kind === "bridge" ? end.topic.split(" › ")[0] : "";
  return topic ? `${place} · ${topic}` : place;
}

const REF_KIND_LABEL: Record<KnowledgeEndpoint["ref"]["kind"], string> = {
  card: "卡片",
  article: "文章",
  "project-item": "项目文档",
  diary: "日记",
};

function EndBox({
  end,
  place,
  claim,
  onOpen,
}: {
  end: KnowledgeEndpoint;
  place: string;
  claim?: string;
  onOpen(end: KnowledgeEndpoint): void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(end)}
      className="bg-surface-hover rounded-tau-sm hover:bg-hover text-tau-meta min-w-0 px-2.5 py-2 text-left leading-[1.65]"
    >
      <span
        className="bg-surface text-ink-3 mb-0.5 inline-block max-w-full truncate rounded px-1.5 text-[10.5px]"
        data-end-place
      >
        {place}
      </span>
      <span className="text-ink-1 block truncate font-medium">《{end.title}》</span>
      <span className="text-ink-2 line-clamp-3 block">{claim || end.excerpt}</span>
    </button>
  );
}

export function MapInsightPopover({
  mark,
  anchor,
  walking,
  onConnect,
  onQuestion,
  onAcknowledge,
  onDismiss,
  onOpen,
  placeOf,
  onClose,
}: MapInsightPopoverProps) {
  const meta = MARK_META[mark.kind];
  const action = primaryAction(mark);
  const direct = action === "connect" && bothCards(mark);
  // 长文那一端的原文片段没核对上时，只能打开看看
  const connectLabel = direct ? "连接" : connectTarget(mark)?.anchor ? "去连接" : "打开看看";
  const connectHint = direct
    ? "在这两张卡片之间加上双向链接"
    : connectLabel === "去连接"
      ? "打开那篇，在原文那几个字上连过去"
      : "打开那篇看看";
  const chain =
    mark.kind === "chain" && mark.missing
      ? [
          ...mark.ends.slice(0, mark.missing.index).map(end => ({ end, missing: null })),
          { end: null, missing: mark.missing.text },
          ...mark.ends.slice(mark.missing.index).map(end => ({ end, missing: null })),
        ]
      : null;

  return (
    <AnchoredPanel anchor={anchor} placement="bottom-start" className="w-[360px] max-w-[360px]">
      <div
        data-map-insight-popover
        className="text-tau-body text-ink-1 px-3.5 pb-2.5 pt-3 leading-[1.7]"
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="text-ink-3 -mr-1.5 -mt-1 mb-0.5 flex items-center gap-1.5 text-[11.5px]">
          <i className={cn("size-[7px] rounded-full", meta.dot)} />
          {meta.label}
          <IconButton
            className="ml-auto size-6"
            title="关闭 (Esc)"
            aria-label="关闭"
            onClick={onClose}
          >
            <X className="size-3.5" strokeWidth={1.75} />
          </IconButton>
        </div>
        <p className="font-medium">{markSummary(mark)}</p>
        {mark.why && <p className="text-ink-2 text-tau-meta mt-0.5">{mark.why}</p>}

        {(mark.kind === "bridge" || mark.kind === "dup" || mark.kind === "conflict") &&
          mark.ends.length === 2 && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {mark.ends.map((end, index) => (
                <EndBox
                  key={index}
                  end={end}
                  place={endPlace(mark, end, placeOf)}
                  claim={mark.claims?.[index]}
                  onOpen={onOpen}
                />
              ))}
            </div>
          )}

        {chain && (
          <div className="text-tau-meta text-ink-2 mt-2 flex flex-wrap items-center gap-1">
            {chain.map((step, index) => (
              <span key={index} className="flex items-center gap-1">
                {index > 0 && <ArrowRight className="text-ink-3 size-3" strokeWidth={1.75} />}
                {step.end ? (
                  <button
                    type="button"
                    onClick={() => onOpen(step.end!)}
                    className="bg-surface-hover rounded-tau-sm hover:bg-hover max-w-[140px] truncate px-2 py-0.5"
                  >
                    {step.end.title}
                  </button>
                ) : (
                  <span className="border-accent text-accent-text rounded-tau-sm border border-dashed px-2 py-0.5">
                    {step.missing}？
                  </span>
                )}
              </span>
            ))}
          </div>
        )}

        {mark.kind === "pattern" && (
          <div className="mt-2 flex flex-wrap gap-1">
            {mark.ends.map((end, index) => (
              <button
                key={index}
                type="button"
                onClick={() => onOpen(end)}
                className="bg-surface-hover rounded-tau-sm hover:bg-hover text-tau-meta text-ink-2 max-w-[160px] truncate px-2 py-0.5"
              >
                {end.title}
              </button>
            ))}
          </div>
        )}

        {mark.kind === "asked" && mark.prompts?.length ? (
          <div className="bg-surface-hover rounded-tau-sm text-tau-meta text-ink-2 mt-2 grid grid-cols-[auto_1fr] gap-x-2.5 px-2.5 py-2 leading-[1.75]">
            {mark.prompts.map((prompt, index) => (
              <Fragment key={index}>
                <span className="text-ink-3 whitespace-nowrap tabular-nums">
                  {day(prompt.time)}
                </span>
                <span className="line-clamp-2 min-w-0">{prompt.text}</span>
              </Fragment>
            ))}
          </div>
        ) : null}

        <div className="mt-2.5 flex items-center gap-1.5">
          {action === "connect" ? (
            <Button
              size="sm"
              variant="primary"
              icon={direct ? Link2 : ArrowUpRight}
              title={connectHint}
              onClick={() => onConnect(mark)}
            >
              {connectLabel}
            </Button>
          ) : action === "acknowledge" ? (
            <Button
              size="sm"
              variant="primary"
              icon={Check}
              title="这一处成立，看到了，不再画出来"
              onClick={() => onAcknowledge(mark)}
            >
              知道了
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              icon={CircleHelp}
              title="建一个问题，把涉及的笔记挂成材料"
              onClick={() => onQuestion(mark)}
            >
              记为问题
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            title="这一处不成立，以后重新分析也不再出现"
            onClick={() => onDismiss(mark)}
          >
            不相关
          </Button>
          {walking && (
            <span className="text-ink-3 ml-auto text-[11px]">
              回车{ACTION_LABEL[action] ?? connectLabel} · ⌫ 不相关
            </span>
          )}
        </div>
      </div>
    </AnchoredPanel>
  );
}
