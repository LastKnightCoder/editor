import { useMemo } from "react";
import dayjs from "dayjs";
import { CalendarRange } from "lucide-react";
import { cn } from "@tau/ui";
import { FadeScroll } from "@/components/FadeScroll";
import useCalendarStore from "@/stores/useCalendarStore";
import { useCalendarEvents } from "@/hooks/useCalendarEvents";
import type { CalendarEvent } from "@/types";
import { usePeekStore } from "../../peekStore";
import { AgendaRow } from "../AgendaRow";
import { useEventDecor } from "../EventTitle";

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

/** 当月按天分组：全天与跨天日程在其覆盖的每一天出现（legacy 只列单日定时日程） */
function groupEventsByDay(events: CalendarEvent[], year: number, month: number) {
  const monthStart = dayjs(new Date(year, month - 1, 1));
  const days: { key: string; date: dayjs.Dayjs; events: CalendarEvent[] }[] = [];
  for (let d = monthStart; d.month() === monthStart.month(); d = d.add(1, "day")) {
    const ts = d.valueOf();
    const dayEvents = events
      .filter(event => {
        const start = dayjs(event.startDate).startOf("day").valueOf();
        const end = event.endDate ? dayjs(event.endDate).startOf("day").valueOf() : start;
        return ts >= start && ts <= end;
      })
      .sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        return (a.startTime ?? Infinity) - (b.startTime ?? Infinity);
      });
    if (dayEvents.length) days.push({ key: d.format("YYYY-MM-DD"), date: d, events: dayEvents });
  }
  return days;
}

const AgendaView = () => {
  const currentDate = useCalendarStore(s => s.currentDate);
  const calendars = useCalendarStore(s => s.calendars);
  const peek = usePeekStore(s => s.peek);
  const { events } = useCalendarEvents();
  const decorOf = useEventDecor(events);

  const date = new Date(currentDate);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const days = useMemo(() => groupEventsByDay(events ?? [], year, month), [events, year, month]);
  const today = dayjs().startOf("day");

  if (days.length === 0) {
    return (
      <div className="text-ink-2 grid h-full place-items-center text-center">
        <div>
          <div className="bg-hover mx-auto mb-3 grid size-12 place-items-center rounded-[14px]">
            <CalendarRange className="size-6" strokeWidth={1.5} />
          </div>
          <p className="text-ink-1 text-tau-title font-semibold">本月没有日程</p>
          <p className="text-tau-meta mt-1">在周视图拖拽时间段、双击月视图格子，或用右栏快速添加</p>
        </div>
      </div>
    );
  }

  // 离纸底留 16px，滚动条不贴纸缘；外层 8px + FadeScroll 右侧 6px 透明边 + pr-[18px] = 内容离右栏 32px
  return (
    <FadeScroll className="mb-4 h-[calc(100%-16px)] pb-2.5 pl-1.5 pr-[18px] pt-1">
      {days.map(({ key, date: day, events: dayEvents }, index) => {
        const isToday = day.isSame(today, "day");
        return (
          <div
            key={key}
            className={cn(
              "grid grid-cols-[112px_minmax(0,1fr)] gap-4 py-3",
              index > 0 && "shadow-[0_-1px_0_var(--tau-line-2)]"
            )}
          >
            <div className="flex flex-col">
              <b
                className={cn(
                  "font-tau-mono text-[22px] font-medium tabular-nums leading-[1.1]",
                  isToday && "text-accent-text"
                )}
              >
                {day.month() + 1}/{day.date()}
              </b>
              <span className={cn("text-ink-3 text-tau-sm mt-0.5", isToday && "text-accent-text")}>
                {WEEKDAYS[day.day()]}
                {isToday && " · 今天"}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              {dayEvents.map(event => (
                <AgendaRow
                  key={event.id}
                  event={event}
                  calendars={calendars}
                  decor={decorOf(event)}
                  onClick={anchor => peek(event, anchor)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </FadeScroll>
  );
};

export default AgendaView;
