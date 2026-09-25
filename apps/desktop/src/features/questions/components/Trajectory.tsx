/**
 * 探究轨迹：按天分组的时间线。自动事件（提出 / 状态 / 关联 / 移除）视觉轻，
 * 手动「记一笔」视觉重（accent 圆点 + 正文字号）；推算出的旧数据时间标「约」。
 * 末尾输入框回车写入一条记录。
 */

import { useState } from "react";
import { NotebookPen } from "lucide-react";
import { cn, toast } from "@tau/ui";
import type { QuestionEvent } from "@/types";
import { TARGET_META, clock, describeEvent, fullDate, relativeDay, type EventView } from "../model";

const DOT: Record<EventView["tone"], string> = {
  start: "bg-surface shadow-[inset_0_0_0_1.5px_var(--tau-accent)]",
  made: "bg-ink-3",
  plain: "bg-surface shadow-[inset_0_0_0_1.5px_var(--tau-ink-3)]",
  muted: "bg-surface shadow-[inset_0_0_0_1.5px_var(--tau-ink-3)]",
  done: "bg-ok",
  note: "bg-accent size-[9px] -left-4 top-2 shadow-[0_0_0_3px_var(--tau-bg-surface)]",
};

export function Trajectory({
  events,
  now,
  onAddNote,
}: {
  events: QuestionEvent[];
  now: number;
  onAddNote(text: string): Promise<void>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  let lastDay = "";

  const submit = async () => {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      await onAddNote(value);
      setText("");
    } catch {
      toast.error("记录失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ol className="relative flex flex-col gap-0.5 pl-4 before:absolute before:bottom-2.5 before:left-1 before:top-2.5 before:w-[1.5px] before:rounded-[1px] before:bg-[var(--tau-bg-track)]">
        {events.map(event => {
          const day = fullDate(event.createTime);
          const showDay = day !== lastDay;
          lastDay = day;
          const view = describeEvent(event);
          return (
            <li key={event.id} className="contents">
              {showDay && (
                <div className="text-ink-3 bg-surface relative -ml-4 mb-0.5 mt-2.5 pl-4 text-[11.5px] font-medium first:mt-0">
                  {relativeDay(event.createTime, now) === "今天" ? "今天" : day}
                </div>
              )}
              <div
                className={cn(
                  "relative flex items-start gap-2.5 py-[3px] text-[12.5px] leading-[1.6]",
                  view.tone === "muted" ? "text-ink-3" : "text-ink-2"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute -left-[15px] top-[9px] size-[7px] rounded-full",
                    DOT[view.tone]
                  )}
                />
                <span className="text-ink-3 w-[34px] shrink-0 pt-px text-[11px] tabular-nums">
                  {view.estimated ? "约" : clock(event.createTime)}
                </span>
                <div className="min-w-0 flex-1">
                  {view.tone === "note" ? (
                    <div className="text-ink-1 whitespace-pre-wrap text-[13px] leading-[1.7]">
                      {view.text}
                    </div>
                  ) : (
                    <span className={cn(view.tone === "done" && "text-ok font-semibold")}>
                      {view.verb}
                      {view.title && (
                        <EventRef
                          type={view.targetType}
                          title={view.title}
                          muted={view.tone === "muted"}
                        />
                      )}
                    </span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      <label className="border-line-1 text-ink-3 focus-within:border-accent mt-2.5 flex h-[34px] cursor-text items-center gap-2 rounded-[10px] border border-dashed px-2.5 focus-within:border-solid focus-within:shadow-[var(--tau-focus-ring)]">
        <NotebookPen className="size-[14px] shrink-0" strokeWidth={1.75} />
        <input
          value={text}
          disabled={busy}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="记一笔：读到了什么、卡在哪、换了什么思路…"
          aria-label="记一笔"
          className="text-ink-1 placeholder:text-ink-3 min-w-0 flex-1 bg-transparent text-[12.5px] outline-none"
        />
      </label>
    </>
  );
}

function EventRef({
  type,
  title,
  muted,
}: {
  type?: keyof typeof TARGET_META;
  title: string;
  muted: boolean;
}) {
  const Icon = type ? TARGET_META[type].icon : null;
  return (
    <span
      className={cn(
        "ml-1.5 inline-flex max-w-full items-center gap-1 align-bottom",
        muted ? "line-through" : "text-ink-1"
      )}
    >
      {Icon && <Icon className="text-ink-3 size-3 shrink-0" strokeWidth={1.75} />}
      <span className="truncate">{title}</span>
    </span>
  );
}
