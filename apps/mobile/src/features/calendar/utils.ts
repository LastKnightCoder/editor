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

/** 固定 6 行 × 7 列网格（周一起始），溢出日期标 dim（设计稿 D 定稿形态） */
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

const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export function weekdayLabel(date: number): string {
  return WEEKDAY_LABELS[new Date(date).getDay()];
}

export function formatDayHead(date: number): { day: string; weekday: string } {
  const d = new Date(date);
  return { day: `${d.getDate()}日`, weekday: weekdayLabel(date) };
}

const MONTH_LABELS = [
  "一月",
  "二月",
  "三月",
  "四月",
  "五月",
  "六月",
  "七月",
  "八月",
  "九月",
  "十月",
  "十一月",
  "十二月",
];

export function formatMonthNav(anchorDate: number): { main: string; sub: string } {
  const d = new Date(anchorDate);
  return { main: `${d.getFullYear()}年${d.getMonth() + 1}月`, sub: MONTH_LABELS[d.getMonth()] };
}

/** 「9月15日 周二」 */
export function formatMonthDay(date: number): string {
  const d = new Date(date);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 「9月15日 周二 · 14:00」/「9月15日 周二 · 全天」 */
export function formatDateTimeLine(date: number, minutes: number | null, allDay: boolean): string {
  return `${formatMonthDay(date)} ${weekdayLabel(date)} · ${allDay || minutes === null ? "全天" : formatTime(minutes)}`;
}

/** 时长人类可读：30 → 「30 分钟」，90 → 「1.5 小时」，125 → 「2 小时 5 分钟」 */
export function durationLabel(startMinutes: number, endMinutes: number): string {
  const total = Math.max(0, endMinutes - startMinutes);
  if (total % 60 === 0) {
    const hours = total / 60;
    return hours === 1 ? "1 小时" : `${hours} 小时`;
  }
  if (total < 60) {
    return `${total} 分钟`;
  }
  if (total % 30 === 0) {
    return `${total / 60} 小时`;
  }
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${hours} 小时 ${minutes} 分钟`;
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

/** 月历格彩点：每个非全天事件一个点（不判重，对齐定稿稿），上限 3 个，超出由「·N」兜底 */
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
): { total: number; upcoming: number; headline: string } {
  if (events.length === 0) {
    return { total: 0, upcoming: 0, headline: "今天没有日程" };
  }
  const nowMinutes = new Date(now).getHours() * 60 + new Date(now).getMinutes();
  const today = dayStart(now);
  const timed = events
    .filter(event => !event.allDay && event.startTime !== null)
    .sort((a, b) => (a.startTime as number) - (b.startTime as number));
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
      headline: allDayCount > 0 ? `${allDayCount} 件全天日程` : "今日日程已结束",
    };
  }
  const remaining = timed.filter(event => event !== next && isOngoing(event)).length + allDayCount;
  const label = `${formatTime(next.startTime as number)} ${next.title}`;
  return {
    total: events.length,
    upcoming: remaining + 1,
    headline: remaining > 0 ? `${label} · 还有 ${remaining} 件` : label,
  };
}
