/**
 * 闪卡复习台重建：结构摘自 features/flashcards/components/ReviewSession.tsx 与 review/*。
 * flipped 0→1 显出背面，rated 选中某个评分（推荐项带描边）。
 */
import clsx from "clsx";
import { FileText, MessageSquareText, MoreHorizontal, Pencil, X } from "lucide-react";
import { Button } from "@tau/ui";
import { REVIEW_CARD } from "../../mock/day";

const RATINGS = [
  { label: "忘记", key: 1, tone: "text-danger", hover: "bg-danger-soft", ring: "ring-danger", interval: "10 分钟后" },
  { label: "模糊", key: 2, tone: "text-warn", hover: "bg-warn-soft", ring: "ring-warn", interval: "1 天后" },
  { label: "记得", key: 3, tone: "text-ok", hover: "bg-ok-soft", ring: "ring-ok", interval: "4 天后" },
  { label: "轻松", key: 4, tone: "text-info", hover: "bg-info-soft", ring: "ring-info", interval: "11 天后" },
];

export type ReviewCard = { deck: string; index: number; total: number; question: string; hint?: string; answer: string; explain: string; source: string };

export function ReviewPage({ flipped = 0, pressed, card = REVIEW_CARD }: { flipped?: number; pressed?: number; card?: ReviewCard }) {
  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pt-1 pb-4">
      <div className="bg-surface shadow-card rounded-tau-lg relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-0.5">
          <i className="bg-accent block h-full" style={{ width: `${(card.index / card.total) * 100}%` }} />
        </div>
        <div className="mt-5 flex h-10 flex-none items-center gap-3 pr-8 pl-6">
          <Button variant="ghost" size="sm" icon={X}>
            结束
          </Button>
          <span className="text-ink-2 text-tau-meta inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap">
            <span className="bg-tag-2-soft text-tag-2 grid size-5 place-items-center rounded-[6px] text-[11px] font-semibold">{[...card.deck][0]}</span>
            {card.deck}
          </span>
          <span className="flex-1" />
          <span className="text-ink-3 flex gap-2.5 text-[11.5px] tabular-nums">
            {[
              ["bg-danger", 0],
              ["bg-warn", 1],
              ["bg-ok", 4],
              ["bg-info", 1],
            ].map(([c, n]) => (
              <span key={c} className="inline-flex items-center gap-1">
                <i className={clsx("size-1.5 rounded-full", c)} />
                {n}
              </span>
            ))}
          </span>
          <span className="text-ink-2 text-tau-meta whitespace-nowrap tabular-nums">
            <b className="text-ink-1 font-semibold">{card.index}</b> / {card.total}
          </span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-8 pt-6 pb-8">
          <div className="m-auto w-full max-w-[720px]">
            <div className="text-ink-3 mb-4 flex items-center gap-2.5 text-[12px]">
              <span className="bg-hover text-ink-2 inline-flex h-5 shrink-0 items-center gap-1 rounded-[6px] px-1.5 text-[11px] whitespace-nowrap">
                <MessageSquareText className="size-[11px]" strokeWidth={1.75} />
                问答
              </span>
              <span className="text-ink-2 inline-flex items-center gap-1.5 text-[11.5px] whitespace-nowrap">
                <i className="bg-warn size-1.5 rounded-full" />
                学习中
              </span>
              <span className="text-ink-2 ml-auto flex gap-1">
                <span className="grid size-6 place-items-center">
                  <Pencil size={13} strokeWidth={1.75} />
                </span>
                <span className="grid size-6 place-items-center">
                  <MoreHorizontal size={14} strokeWidth={1.75} />
                </span>
              </span>
            </div>
            <div className="text-[20px] leading-[1.8] font-medium">{card.question}</div>
            {card.hint && <div className="text-ink-2 mt-2 text-[13.5px]">{card.hint}</div>}
            <div className="mt-7 flex flex-col gap-4 text-[14px] leading-[1.75]" style={{ opacity: flipped, transform: `translateY(${(1 - flipped) * 14}px)` }}>
              {/* 问答卡不判对错（correct === null）：浅灰底、小字「参考答案」（review/CardBack.tsx） */}
              <div className="bg-hover rounded-[12px] px-4 py-3">
                <div className="text-ink-3 text-[12px]">参考答案</div>
                <p className="text-ink-1 mt-1 text-[16px] leading-[1.7] font-medium whitespace-pre-wrap">{card.answer}</p>
              </div>
              <div className="border-line-2 grid grid-cols-[72px_minmax(0,1fr)] gap-x-4 border-t pt-4">
                <span className="text-ink-3 pt-px text-[12.5px] leading-[1.75]">解析</span>
                <span className="text-ink-2 min-w-0">{card.explain}</span>
                <span className="text-ink-3 mt-3 pt-px text-[12.5px] leading-[1.75]">参考资料</span>
                <span className="mt-3">
                  <span className="border-line-1 text-ink-2 inline-flex h-7 max-w-full items-center gap-1.5 rounded-[8px] border px-2.5 text-[12.5px]">
                    <FileText size={13} strokeWidth={1.75} />
                    {card.source}
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="relative flex-none px-8 pt-2 pb-5">
          <div className="mx-auto w-full max-w-[720px]">
            <div className="flex min-h-[54px] flex-col justify-center" style={{ opacity: Math.max(0.35, flipped) }}>
              <div className="grid grid-cols-4 gap-2">
                {RATINGS.map(r => (
                  <div
                    key={r.key}
                    className={clsx(
                      "border-line-1 relative flex flex-col items-center gap-px rounded-[12px] border px-1.5 pt-[9px] pb-2",
                      pressed === r.key ? r.hover : "bg-surface",
                      r.key === 3 && clsx("ring-[1.5px] ring-inset", r.ring)
                    )}
                    style={pressed === r.key ? { transform: "translateY(1px)" } : undefined}
                  >
                    <kbd className="bg-hover text-ink-2 absolute top-[7px] right-2 rounded-[4px] px-1 font-mono text-[10px] leading-4">{r.key}</kbd>
                    <span className={clsx("text-[13.5px] font-semibold", r.tone)}>{r.label}</span>
                    <span className="text-ink-2 text-[11.5px] tabular-nums">{r.interval}</span>
                  </div>
                ))}
              </div>
              <div className="text-ink-3 mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px]">1–4 评分 · Space 采用推荐 · ⌘Z 撤销上一张 · E 编辑 · Esc 结束</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
