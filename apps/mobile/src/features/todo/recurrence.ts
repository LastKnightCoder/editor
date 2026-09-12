import type { TodoRecurrence } from "../../types";

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDayTimestamp(value: number | Date): number {
  const date = typeof value === "number" ? new Date(value) : new Date(value.getTime());
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function startOfWeekTimestamp(value: number | Date): number {
  const ts = startOfDayTimestamp(value);
  const date = new Date(ts);
  date.setDate(date.getDate() - date.getDay());
  return date.getTime();
}

function diffDays(fromTs: number, toTs: number): number {
  // 按日历日计算：DST 切换日一天只有 23/25 小时，毫秒差除法会把相邻两天算成同一天
  return Math.round((startOfDayTimestamp(toTs) - startOfDayTimestamp(fromTs)) / DAY_MS);
}

function diffMonths(fromTs: number, toTs: number): number {
  const fromDate = new Date(fromTs);
  const toDate = new Date(toTs);
  return (
    (toDate.getFullYear() - fromDate.getFullYear()) * 12 + (toDate.getMonth() - fromDate.getMonth())
  );
}

export function getStartOfDayTimestamp(value: number | Date): number {
  return startOfDayTimestamp(value);
}

export function getTodayNormalized(): number {
  return startOfDayTimestamp(Date.now());
}

export function isDateScheduledForRecurrence(
  recurrence: TodoRecurrence,
  day: number | Date
): boolean {
  const date = startOfDayTimestamp(day);
  const startDate = startOfDayTimestamp(recurrence.startDate);
  const endDate = recurrence.endDate ? startOfDayTimestamp(recurrence.endDate) : null;

  if (date < startDate) {
    return false;
  }
  if (endDate != null && date > endDate) {
    return false;
  }

  const interval = Math.max(1, recurrence.interval || 1);

  if (recurrence.type === "daily" || recurrence.type === "custom") {
    return diffDays(startDate, date) % interval === 0;
  }

  if (recurrence.type === "weekdays") {
    const weekday = new Date(date).getDay();
    if (weekday === 0 || weekday === 6) {
      return false;
    }
    return diffDays(startDate, date) % interval === 0;
  }

  if (recurrence.type === "weekly") {
    const weekDiff = diffDays(startOfWeekTimestamp(startDate), startOfWeekTimestamp(date)) / 7;
    if (weekDiff % interval !== 0) {
      return false;
    }
    const defaultWeekday = new Date(startDate).getDay();
    const weekdays =
      recurrence.weekdays && recurrence.weekdays.length > 0
        ? recurrence.weekdays
        : [defaultWeekday];
    return weekdays.includes(new Date(date).getDay());
  }

  if (recurrence.type === "monthly") {
    const monthDiff = diffMonths(startDate, date);
    if (monthDiff % interval !== 0) {
      return false;
    }
    const targetDay = recurrence.monthDay ?? new Date(startDate).getDate();
    return new Date(date).getDate() === targetDay;
  }

  if (recurrence.type === "yearly") {
    const dateObject = new Date(date);
    const startObject = new Date(startDate);
    const yearDiff = dateObject.getFullYear() - startObject.getFullYear();
    if (yearDiff % interval !== 0) {
      return false;
    }
    const targetMonth = recurrence.yearMonth ?? startObject.getMonth() + 1;
    const targetDay = recurrence.yearDay ?? startObject.getDate();
    return dateObject.getMonth() + 1 === targetMonth && dateObject.getDate() === targetDay;
  }

  return diffDays(startDate, date) % interval === 0;
}

export function isTodayScheduled(recurrence: TodoRecurrence): boolean {
  return isDateScheduledForRecurrence(recurrence, Date.now());
}
