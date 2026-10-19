/**
 * 卡片详情（通用）：结构摘自 features/cards/views/CardDetailView.tsx，与 CardEditorPage 同一套类名；
 * 正文用 LiveDoc 按排期就地成型，内容由调用方给。
 */
import type { ReactNode } from "react";
import { MoreHorizontal, Plus, Sparkles, Waypoints } from "lucide-react";
import { LiveDoc } from "../doc/LiveDoc";
import type { Timed } from "../doc/script";

function Tag({ children }: { children: ReactNode }) {
  return <span className="text-tau-sm border-line-1 bg-surface text-ink-2 inline-flex h-[22px] max-w-full items-center gap-1.5 rounded-full border px-[9px] leading-none">{children}</span>;
}

export function CardPage({ timed, frame, words, links, tags, created, tail }: { timed: Timed[]; frame: number; words: number; links: number; tags: string[]; created: string; tail?: ReactNode }) {
  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1720px] flex-col px-4 pt-1 pb-4">
      <div className="bg-surface shadow-card rounded-tau-lg flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="my-4 min-h-0 flex-1 overflow-hidden">
          <div className="grid grid-cols-[1fr_minmax(0,640px)_1fr] items-start px-[26px] pt-6 pb-8">
            <article className="col-start-2 min-w-0">
              <div className="mb-5 flex items-center gap-2.5">
                <span className="text-tau-meta text-ink-3 min-w-0 truncate tabular-nums">
                  创建于 {created} · 最后修改 刚刚 · {words} 字
                </span>
                {links > 0 && (
                  <span className="text-tau-meta text-ink-2 inline-flex h-[22px] shrink-0 items-center gap-[5px] rounded-full px-2 tabular-nums">
                    <Waypoints className="size-[13px]" strokeWidth={1.75} />
                    {links} 处关联
                  </span>
                )}
                <span className="text-tau-meta text-ink-2 inline-flex h-[22px] shrink-0 items-center gap-[5px] rounded-full px-2">
                  <Sparkles className="size-[13px]" strokeWidth={1.75} />
                  AI 洞见
                </span>
                <span className="ml-auto flex items-center gap-1">
                  <span className="text-ink-3 grid size-[26px] place-items-center">
                    <MoreHorizontal className="size-4" strokeWidth={1.75} />
                  </span>
                </span>
              </div>
              <div className="min-h-[80px]">
                <LiveDoc timed={timed} frame={frame} />
                {tail && <div className="text-[16px] leading-[1.65]">{tail}</div>}
              </div>
              <div className="border-line-2 mt-[34px] flex flex-wrap items-center gap-1.5 border-t pt-[18px]">
                {tags.map(tag => (
                  <Tag key={tag}>{tag}</Tag>
                ))}
                <Tag>
                  <Plus className="size-3" strokeWidth={2} />
                  添加标签
                </Tag>
              </div>
            </article>
          </div>
        </div>
      </div>
    </div>
  );
}
