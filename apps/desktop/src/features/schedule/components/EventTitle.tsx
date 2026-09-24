/**
 * 日程标题（各视图共用）：普通日程只有标题；番茄钟日程前置计时图标（去掉数据里的 🍅）；
 * 待办日程前置勾选圈，点圈直接完成 / 取消（不冒泡、不触发日程点击与拖拽）。
 */

import { useCallback } from "react";
import { Check, Timer } from "lucide-react";
import { cn } from "@tau/ui";
import type { CalendarEvent, TodoCalendarEventSource } from "@/types";
import { displayTitle, type EventSourceKind } from "../eventTone";
import { useCalendarKinds, useTodoEventSources, useToggleTodoEvent } from "../queries";

export interface EventDecor {
  kind?: EventSourceKind;
  source?: TodoCalendarEventSource;
  onToggle?: () => void;
}

/** 视图级：一次拿齐来源信息，返回按日程取装饰的函数 */
export function useEventDecor(events: CalendarEvent[]) {
  const kinds = useCalendarKinds();
  const sources = useTodoEventSources(events);
  const toggle = useToggleTodoEvent();
  return useCallback(
    (event: CalendarEvent): EventDecor => {
      const kind = kinds.get(event.calendarId);
      const source = kind === "todo" ? sources[event.id] : undefined;
      return { kind, source, onToggle: source ? () => toggle(source) : undefined };
    },
    [kinds, sources, toggle]
  );
}

interface EventTitleProps {
  event: CalendarEvent;
  decor: EventDecor;
  className?: string;
}

export function EventTitle({ event, decor, className }: EventTitleProps) {
  const done = decor.source?.isCompleted === true;
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5", className)}>
      {decor.kind === "pomodoro" && (
        <Timer aria-label="番茄钟" className="size-3 shrink-0 opacity-75" strokeWidth={2} />
      )}
      {decor.kind === "todo" && (
        <button
          type="button"
          aria-label={done ? "标记为未完成" : "标记为完成"}
          disabled={!decor.onToggle}
          onClick={e => {
            e.stopPropagation();
            decor.onToggle?.();
          }}
          onMouseDown={e => e.stopPropagation()}
          className={cn(
            "grid size-3 shrink-0 cursor-pointer place-items-center rounded-full",
            "shadow-[inset_0_0_0_1.5px_var(--cal)] transition-colors disabled:cursor-default",
            done && "bg-[var(--cal)] shadow-none"
          )}
        >
          {done && <Check className="text-ink-inverse size-2" strokeWidth={3.5} />}
        </button>
      )}
      <span className={cn("truncate", done && "text-ink-3 line-through")}>
        {displayTitle(event, decor.kind)}
      </span>
    </span>
  );
}
