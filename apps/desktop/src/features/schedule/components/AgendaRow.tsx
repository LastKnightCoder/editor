/**
 * 议程行（议程视图与月视图「还有 N 项」弹窗共用）：
 * mono 时间 | 色块 | 标题 + 备注摘要 | 日历名。备注只取纯文本摘要，不再嵌只读编辑器。
 */

import { cn } from "@tau/ui";
import { formatTime } from "@/utils/calendar";
import { clampText, richTextPlainText } from "@tau/shared/rich-text-text";
import type { Calendar, CalendarEvent } from "@/types";
import { TONE, eventToneStyle } from "../eventTone";
import { EventTitle, type EventDecor } from "./EventTitle";

export function eventTimeLabel(event: CalendarEvent) {
  if (event.allDay || event.startTime === null) return "全天";
  return event.endTime !== null
    ? `${formatTime(event.startTime)} – ${formatTime(event.endTime)}`
    : formatTime(event.startTime);
}

export function AgendaRow({
  event,
  calendars,
  decor,
  onClick,
}: {
  event: CalendarEvent;
  calendars: Calendar[];
  decor: EventDecor;
  onClick: (anchor: HTMLElement) => void;
}) {
  const calendar = calendars.find(c => c.id === event.calendarId);
  const excerpt = event.detailContent ? clampText(richTextPlainText(event.detailContent), 120) : "";
  return (
    <div
      onClick={e => onClick(e.currentTarget)}
      style={eventToneStyle(event, calendars)}
      className={cn(
        "hover:bg-hover grid cursor-pointer grid-cols-[104px_10px_minmax(0,1fr)_auto] items-start gap-2.5 rounded-[9px] px-2.5 py-1.5",
        TONE
      )}
    >
      <span
        className={cn(
          "font-tau-mono pt-px text-[11.5px] tabular-nums",
          event.allDay ? "text-ink-3" : "text-ink-2"
        )}
      >
        {eventTimeLabel(event)}
      </span>
      <i className="mt-[6px] size-2 rounded-[3px] bg-[var(--cal)]" />
      <div className="min-w-0">
        <EventTitle event={event} decor={decor} className="text-tau-body font-medium" />
        {excerpt && <p className="text-ink-3 text-tau-meta mt-0.5 line-clamp-2">{excerpt}</p>}
      </div>
      <span className="text-ink-3 text-tau-sm pt-px">{calendar?.title}</span>
    </div>
  );
}
