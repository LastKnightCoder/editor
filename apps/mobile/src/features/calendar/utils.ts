// 日历域纯函数工具：日期网格、分钟数↔显示、事件排序与过滤。
// 日期语义对齐桌面 utils/calendar.ts：本地时区 00:00 时间戳 + 周一起始。

import type { CalendarEvent } from "./types";

export function dayStart(timestamp: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function todayStart(): number {
  return dayStart(Date.now());
}

export function addDays(timestamp: number, days: number): number {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days).getTime();
}

/** 墙钟分钟不能通过毫秒相加换算，夏令时切换日可能只有 23 或 25 小时。 */
export function atLocalTime(date: number, minutes: number | null): number {
  const value = new Date(date);
  value.setHours(Math.floor((minutes ?? 0) / 60), (minutes ?? 0) % 60, 0, 0);
  return value.getTime();
}

/** 周一起始（diff = day === 0 ? -6 : 1 - day，对齐桌面 getWeekStart） */
export function getWeekStart(timestamp: number): number {
  const date = new Date(timestamp);
  const day = date.getDay();
  return addDays(dayStart(timestamp), day === 0 ? -6 : 1 - day);
}

export interface MonthGridCell {
  /** 本地 00:00 时间戳 */
  date: number;
  dayOfMonth: number;
  inAnchorMonth: boolean;
}

/** 固定 6 行 × 7 列网格（周一起始），溢出日期标 dim */
export function getMonthGrid(anchorDate: number): MonthGridCell[] {
  const anchor = new Date(anchorDate);
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const firstOfMonth = new Date(year, month, 1).getTime();
  const firstDay = new Date(firstOfMonth).getDay();
  const gridStart = addDays(firstOfMonth, firstDay === 0 ? -6 : 1 - firstDay);
  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index);
    const cellDate = new Date(date);
    return {
      date,
      dayOfMonth: cellDate.getDate(),
      inAnchorMonth: cellDate.getMonth() === month,
    };
  });
}

/** 事件是否在某天出现（含跨天每天出现，对齐桌面 MonthView 筛选语义） */
export function eventOccursOnDay(event: CalendarEvent, date: number): boolean {
  const start = dayStart(event.startDate);
  const end = dayStart(event.endDate ?? event.startDate);
  return date >= start && date <= end;
}

export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const MAX_MINUTES = Number.MAX_SAFE_INTEGER;

/**
 * 稳定排序：全天在前，非全天按开始分钟升序（桌面弹层排序语义），
 * 以 start_date、id 兜底保证稳定。
 */
export function sortEventsForDay(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => {
    if (a.allDay !== b.allDay) {
      return a.allDay ? -1 : 1;
    }
    const aStart = a.allDay ? a.startDate : (a.startTime ?? MAX_MINUTES);
    const bStart = b.allDay ? b.startDate : (b.startTime ?? MAX_MINUTES);
    if (aStart !== bStart) {
      return aStart - bStart;
    }
    if (a.startDate !== b.startDate) {
      return a.startDate - b.startDate;
    }
    return a.id - b.id;
  });
}

/** 月历格彩点：每个非全天事件一个点（不判重），上限 3 个，超出由「·N」兜底 */
export function eventDotsForDay(
  events: CalendarEvent[],
  date: number,
  resolveColor: (event: CalendarEvent) => string
): string[] {
  return events
    .filter(event => eventOccursOnDay(event, date) && !event.allDay)
    .slice(0, 3)
    .map(resolveColor);
}

export function isSameDay(a: number, b: number): boolean {
  return dayStart(a) === dayStart(b);
}

/** 首页今日日程摘要：下一件未结束的定时日程「14:00 周会 · 还有 2 件」；
 *  无定时日程时全天件数兜底，全部结束给收尾文案。upcoming = 未结束定时日程 + 全天日程 */
export function summarizeToday(
  events: CalendarEvent[],
  now = Date.now()
): {
  total: number;
  upcoming: number;
  next: (CalendarEvent & { startTime: number }) | null;
  remaining: number;
  allDayCount: number;
} {
  if (events.length === 0) {
    return { total: 0, upcoming: 0, next: null, remaining: 0, allDayCount: 0 };
  }
  const nowMinutes = new Date(now).getHours() * 60 + new Date(now).getMinutes();
  const today = dayStart(now);
  const timed = events
    .filter(
      (event): event is CalendarEvent & { startTime: number } =>
        !event.allDay && event.startTime !== null
    )
    .sort((a, b) => a.startTime - b.startTime);
  const allDayCount = events.filter(event => event.allDay).length;
  const isOngoing = (event: CalendarEvent) => {
    // 跨到未来日的定时事件必然未结束（endTime 只对尾日有效，不能与今日 now 比较）
    if (event.endDate !== null && event.endDate > today) {
      return true;
    }
    return (event.endTime ?? event.startTime ?? 0) > nowMinutes;
  };
  const next = timed.find(isOngoing);

  if (!next) {
    return {
      total: events.length,
      upcoming: allDayCount,
      next: null,
      remaining: allDayCount,
      allDayCount,
    };
  }
  const remaining = timed.filter(event => event !== next && isOngoing(event)).length + allDayCount;
  return {
    total: events.length,
    upcoming: remaining + 1,
    next,
    remaining,
    allDayCount,
  };
}
