/**
 * 点地图上一处标记后的气泡：开头一句直白说出这一处是什么（insightSummary），下面一行 AI 给的理由，涉及谁（呼应 / 重复 / 矛盾并排两端，缺一环一条链，
 * 问了没写列出问过的几次），最多两个按钮。逐条看时附一行快捷键提示。
 */

import { Fragment } from "react";
import { ArrowRight, ArrowUpRight, Link2, MessageCircle, PenLine, X } from "lucide-react";
import { AnchoredPanel, Button, IconButton, cn } from "@tau/ui";
import type { KnowledgeEndpoint, KnowledgeMark } from "@/types/knowledge-insights";
import { MARK_META, bothCards, connectTarget, primaryAction } from "./model";

import {
  useMapInsightsI18n,
  insightKindLabel,
  insightRefLabel,
  insightSummary,
  insightDate,
  type InsightsTranslate,
} from "./i18n";

export interface MapInsightPopoverProps {
  mark: KnowledgeMark;
  anchor: HTMLElement | null;
  walking: boolean;
  onConnect(mark: KnowledgeMark): void;
  /** 聊一聊：带着两端开一个对话（矛盾） */
  onDiscuss(mark: KnowledgeMark): void;
  /** 写成卡片：新建一张空卡片连上这几处并打开（同一思路、缺一环、问了没写、还缺） */
  onWrite(mark: KnowledgeMark): void;
  onDismiss(mark: KnowledgeMark): void;
  onOpen(end: KnowledgeEndpoint): void;
  placeOf(end: KnowledgeEndpoint): string | null;
  /** 关闭气泡（逐条看时一并结束），与 Esc 第一层相同 */
  onClose(): void;
}

/**
 * 端框顶部那一行：这篇在哪（卡片 / 文章 / 项目文档 · 项目名）。呼应是跨主题的，再加上所属大主题；
 * 其余类型两端在同一主题里，主题名两边一样，不显示。
 */
function endPlace(
  mark: KnowledgeMark,
  end: KnowledgeEndpoint,
  placeOf: (end: KnowledgeEndpoint) => string | null,
  t: InsightsTranslate
) {
  const place = placeOf(end) ?? insightRefLabel(end.ref.kind, t);
  const topic = mark.kind === "bridge" ? end.topic.split(" › ")[0] : "";
  return topic ? `${place} · ${topic}` : place;
}

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
  onDiscuss,
  onWrite,
  onDismiss,
  onOpen,
  placeOf,
  onClose,
}: MapInsightPopoverProps) {
  const { t, locale } = useMapInsightsI18n();
  const meta = MARK_META[mark.kind];
  const action = primaryAction(mark);
  const direct = action === "connect" && bothCards(mark);
  // 长文那一端的原文片段没核对上时，只能打开看看
  const anchored = Boolean(connectTarget(mark)?.anchor);
  const connectLabel = t(
    direct ? "insights.connect" : anchored ? "insights.goConnect" : "insights.openLook"
  );
  const connectHint = t(
    direct ? "insights.connectHint" : anchored ? "insights.goConnectHint" : "insights.openLookHint"
  );
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
        className="text-tau-body text-ink-1 px-3.5 pt-3 pb-2.5 leading-[1.7]"
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="text-ink-3 -mt-1 -mr-1.5 mb-0.5 flex items-center gap-1.5 text-[11.5px]">
          <i className={cn("size-[7px] rounded-full", meta.dot)} />
          {insightKindLabel(mark.kind, t)}
          <IconButton
            className="ml-auto size-6"
            title={t("insights.closeShortcut")}
            aria-label={t("insights.close")}
            onClick={onClose}
          >
            <X className="size-3.5" strokeWidth={1.75} />
          </IconButton>
        </div>
        <p className="font-medium">{insightSummary(mark, t)}</p>
        {mark.why && <p className="text-ink-2 text-tau-meta mt-0.5">{mark.why}</p>}

        {(mark.kind === "bridge" || mark.kind === "dup" || mark.kind === "conflict") &&
          mark.ends.length === 2 && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {mark.ends.map((end, index) => (
                <EndBox
                  key={index}
                  end={end}
                  place={endPlace(mark, end, placeOf, t)}
                  claim={mark.claims?.[index]}
                  onOpen={onOpen}
                />
              ))}
            </div>
          )}

        {chain && (
          <div className="text-tau-meta text-ink-2 mt-2 flex flex-wrap items-center gap-1">
            {chain.map((step, index) => {
              const end = step.end;
              return (
                <span key={index} className="flex items-center gap-1">
                  {index > 0 && <ArrowRight className="text-ink-3 size-3" strokeWidth={1.75} />}
                  {end ? (
                    <button
                      type="button"
                      onClick={() => onOpen(end)}
                      className="bg-surface-hover rounded-tau-sm hover:bg-hover max-w-[140px] truncate px-2 py-0.5"
                    >
                      {end.title}
                    </button>
                  ) : (
                    <span className="border-accent text-accent-text rounded-tau-sm border border-dashed px-2 py-0.5">
                      {step.missing}？
                    </span>
                  )}
                </span>
              );
            })}
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
                  {insightDate(prompt.time, locale)}
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
          ) : action === "write" ? (
            <Button
              size="sm"
              variant="primary"
              icon={PenLine}
              title={mark.ends.length ? t("insights.writeLinkedHint") : t("insights.writeHint")}
              onClick={() => onWrite(mark)}
            >
              {t("insights.write")}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              icon={MessageCircle}
              title={t("insights.discussHint")}
              onClick={() => onDiscuss(mark)}
            >
              {t("insights.discuss")}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            title={t("insights.dismissHint")}
            onClick={() => onDismiss(mark)}
          >
            {t("insights.dismiss")}
          </Button>
          {walking && (
            <span className="text-ink-3 ml-auto text-[11px]">
              {t("insights.walkAction", {
                action:
                  action === "connect"
                    ? connectLabel
                    : t(action === "write" ? "insights.write" : "insights.discuss"),
              })}
            </span>
          )}
        </div>
      </div>
    </AnchoredPanel>
  );
}
