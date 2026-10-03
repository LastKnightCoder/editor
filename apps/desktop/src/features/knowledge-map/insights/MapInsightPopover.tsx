/**
 * 点地图上一处标记后的气泡：一句理由，涉及谁（呼应 / 重复 / 矛盾并排两端，缺一环一条链，
 * 问了没写列出问过的几次），最多两个按钮。逐条看时附一行快捷键提示。
 */

import { ArrowRight, ArrowUpRight, CircleHelp, Link2 } from "lucide-react";
import { AnchoredPanel, Button, cn } from "@tau/ui";
import type { KnowledgeEndpoint, KnowledgeMark } from "@/types/knowledge-insights";
import { MARK_META, bothCards, connectTarget, connectsByDefault } from "./model";

export interface MapInsightPopoverProps {
  mark: KnowledgeMark;
  anchor: HTMLElement | null;
  walking: boolean;
  onConnect(mark: KnowledgeMark): void;
  onQuestion(mark: KnowledgeMark): void;
  onDismiss(mark: KnowledgeMark): void;
  onOpen(end: KnowledgeEndpoint): void;
}

const day = (time: number) => {
  const date = new Date(time);
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
};

function EndBox({
  end,
  claim,
  onOpen,
}: {
  end: KnowledgeEndpoint;
  claim?: string;
  onOpen(end: KnowledgeEndpoint): void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(end)}
      className="bg-surface-hover rounded-tau-sm hover:bg-hover text-tau-meta min-w-0 px-2.5 py-2 text-left leading-[1.65]"
    >
      {end.topic && (
        <span className="bg-surface text-ink-3 mb-0.5 inline-block max-w-full truncate rounded px-1.5 text-[10.5px]">
          {end.topic}
        </span>
      )}
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
  onDismiss,
  onOpen,
}: MapInsightPopoverProps) {
  const meta = MARK_META[mark.kind];
  const connects = connectsByDefault(mark);
  const direct = connects && bothCards(mark);
  // 长文那一端的原文片段没核对上时，只能打开看看
  const connectLabel = direct ? "连接" : connectTarget(mark)?.anchor ? "去连接" : "打开看看";
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
        <div className="text-ink-3 mb-1 flex items-center gap-1.5 text-[11.5px]">
          <i className={cn("size-[7px] rounded-full", meta.dot)} />
          {meta.label}
        </div>
        {mark.kind === "bridge" && mark.text && <p className="font-medium">{mark.text}</p>}
        {(mark.kind === "gap" || mark.kind === "asked") && mark.text && (
          <p className="font-medium">{mark.text}</p>
        )}
        {mark.kind === "pattern" && mark.text && <p className="font-medium">「{mark.text}」</p>}
        <p className={cn(mark.text && mark.kind !== "chain" ? "text-ink-2 text-tau-meta" : "")}>
          {mark.why}
        </p>

        {(mark.kind === "bridge" || mark.kind === "dup" || mark.kind === "conflict") &&
          mark.ends.length === 2 && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {mark.ends.map((end, index) => (
                <EndBox key={index} end={end} claim={mark.claims?.[index]} onOpen={onOpen} />
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
          <div className="bg-surface-hover rounded-tau-sm text-tau-meta text-ink-2 mt-2 px-2.5 py-2 leading-[1.75]">
            {mark.prompts.map((prompt, index) => (
              <div key={index} className="flex gap-2">
                <span className="text-ink-3 w-[52px] shrink-0">{day(prompt.time)}</span>
                <span className="line-clamp-2 min-w-0">{prompt.text}</span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-2.5 flex items-center gap-1.5">
          {connects ? (
            <Button
              size="sm"
              variant="primary"
              icon={direct ? Link2 : ArrowUpRight}
              onClick={() => onConnect(mark)}
            >
              {connectLabel}
            </Button>
          ) : (
            <Button size="sm" variant="primary" icon={CircleHelp} onClick={() => onQuestion(mark)}>
              记为问题
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => onDismiss(mark)}>
            不相关
          </Button>
          {walking && (
            <span className="text-ink-3 ml-auto text-[11px]">
              回车{connects ? connectLabel : "记为问题"} · ⌫ 不相关
            </span>
          )}
        </div>
      </div>
    </AnchoredPanel>
  );
}
