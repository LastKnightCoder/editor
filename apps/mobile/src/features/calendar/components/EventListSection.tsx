// 日程列表区（定稿 A 视觉）：全天 chip 置顶 + 定时事件行（时间列/色条/标题/meta），
// 今日插入「现在」分隔线，空态引导新建。底部留白由主页整页滚动容器承载，这里只留呼吸间距。

import { memo } from "react";
import { CalendarDays } from "lucide-react";
import type { CalendarEvent } from "../types";
import { formatTime, isSameDay, sortEventsForDay, todayStart, formatMonthDay } from "../utils";

type EventListSectionProps = {
  events: CalendarEvent[];
  selectedDate: number;
  nowMinutes: number;
  resolveColor: (event: CalendarEvent) => string;
  onSelectEvent: (event: CalendarEvent) => void;
};

function pastOf(event: CalendarEvent, selectedDate: number, nowMinutes: number): boolean {
  if (!isSameDay(selectedDate, todayStart()) || event.allDay) {
    return false;
  }
  // 跨天事件的 endTime 只对尾日有效，首日/中间日恒未结束
  if (
    event.endDate !== null &&
    event.endDate !== event.startDate &&
    !isSameDay(event.endDate, selectedDate)
  ) {
    return false;
  }
  const end = event.endTime ?? event.startTime ?? 0;
  return end <= nowMinutes;
}

function EventListSectionImpl({
  events,
  selectedDate,
  nowMinutes,
  resolveColor,
  onSelectEvent,
}: EventListSectionProps) {
  const sorted = sortEventsForDay(events.filter(event => !event.allDay));
  const allDayEvents = sortEventsForDay(events.filter(event => event.allDay));
  const isToday = selectedDate === todayStart();

  let dividerPlaced = false;

  return (
    <div className="px-[18px] pb-2 pt-2">
      {allDayEvents.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {allDayEvents.map(event => {
            const color = resolveColor(event);
            const crossDay = event.endDate !== null && event.endDate !== event.startDate;
            return (
              <button
                key={event.id}
                type="button"
                onClick={() => onSelectEvent(event)}
                className="text-ink-1 flex min-h-[34px] max-w-full flex-wrap items-center gap-[7px] break-words rounded-xl border px-[13px] py-1.5 text-left text-[12.5px] font-bold"
                style={{ background: `${color}21`, borderColor: color }}
              >
                <i className="h-[7px] w-[7px] rounded-full" style={{ background: color }} />
                {event.title}
                {crossDay && event.endDate ? (
                  <small className="text-ink-3 font-semibold">
                    · 至 {formatMonthDay(event.endDate)}
                  </small>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {sorted.length === 0 && allDayEvents.length === 0 ? (
        <div className="bg-surface shadow-card mt-3.5 rounded-[18px] px-5 py-[26px] text-center">
          <CalendarDays size={30} className="text-ink-3 mx-auto" aria-hidden />
          <div className="text-ink-1 mt-2 text-[14px] font-extrabold">这天没有日程</div>
          <div className="text-ink-2 mt-1 text-[12px]">点右上 ＋ 新建</div>
        </div>
      ) : (
        <div className="flex flex-col gap-[9px]">
          {sorted.map(event => {
            const color = resolveColor(event);
            // 跨天定时事件的时刻只对首日有效，其余日期不渲染误导性的「开始/结束」时刻
            const crossDayTimed = event.endDate !== null && event.endDate !== event.startDate;
            const showDivider =
              isToday && !dividerPlaced && !pastOf(event, selectedDate, nowMinutes);
            if (showDivider) {
              dividerPlaced = true;
            }
            const row = (
              <button
                key={event.id}
                type="button"
                onClick={() => onSelectEvent(event)}
                className={`bg-surface shadow-card text-ink-1 flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-left transition active:scale-[0.98] ${
                  pastOf(event, selectedDate, nowMinutes) ? "opacity-55" : ""
                }`}
              >
                <span className="w-[52px] flex-none text-right">
                  {crossDayTimed ? (
                    <b className="text-[12px] font-extrabold">跨天</b>
                  ) : (
                    <>
                      <b className="text-[13.5px] font-extrabold tabular-nums">
                        {formatTime(event.startTime ?? 0)}
                      </b>
                      <span className="text-ink-3 block text-[11px] font-semibold tabular-nums">
                        {event.endTime !== null ? formatTime(event.endTime) : ""}
                      </span>
                    </>
                  )}
                </span>
                <span className="h-9 w-1 flex-none rounded-full" style={{ background: color }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold">{event.title}</span>
                  <span className="text-ink-2 mt-0.5 flex items-center gap-1.5 text-[11.5px]">
                    {event.isInSystemEvent ? (
                      <span className="bg-page text-ink-3 rounded-full px-[7px] py-px text-[10px] font-bold">
                        {event.calendarTitle ?? "系统"}
                      </span>
                    ) : null}
                    {event.calendarTitle ?? ""}
                  </span>
                </span>
              </button>
            );
            return showDivider ? (
              <div key={`wrap-${event.id}`}>
                <div className="flex items-center gap-2 px-0.5 py-1.5">
                  <span className="text-accent text-[11px] font-extrabold tabular-nums">
                    {formatTime(nowMinutes)}
                  </span>
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{
                      background: "var(--tau-accent)",
                      boxShadow: "0 0 0 4px var(--tau-accent-soft)",
                    }}
                  />
                  <span className="h-0.5 flex-1 rounded-full bg-[var(--tau-accent)]" />
                </div>
                {row}
              </div>
            ) : (
              row
            );
          })}
          {isToday && !dividerPlaced && sorted.length > 0 ? (
            <div className="flex items-center gap-2 px-0.5 py-1.5">
              <span className="text-ink-3 text-[11px] font-extrabold">今日日程已结束</span>
              <span className="h-0.5 flex-1 rounded-full bg-[var(--tau-line-1)]" />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export const EventListSection = memo(EventListSectionImpl);
