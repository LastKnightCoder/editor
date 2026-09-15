export interface CalendarRecurrenceRule {
  type: string;
  interval: number;
  startDate: number;
  endDate?: number | null;
  maxOccurrences?: number | null;
  weekdays?: number[] | null;
  monthDay?: number | null;
  yearMonth?: number | null;
  yearDay?: number | null;
  excludeHolidays?: boolean;
}

const dayOrdinal = (date: Date) =>
  Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
const lastDay = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

/** 规则锚定起始日；节假日顺延不改变后续节奏，次数上限按原始 occurrence 计数。 */
export function calendarOccurrencesInRange(
  rule: CalendarRecurrenceRule,
  rangeStart: number,
  rangeEnd: number,
  holidays: Set<number> = new Set()
): number[] {
  if (rangeEnd < rangeStart) return [];
  const windowStart = new Date(rangeStart);
  windowStart.setHours(0, 0, 0, 0);
  const start = new Date(rule.startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(Math.min(rangeEnd, rule.endDate ?? rangeEnd));
  end.setHours(23, 59, 59, 999);
  const interval = Math.max(1, rule.interval || 1);
  const limit = Math.max(0, rule.maxOccurrences ?? Infinity);
  const result: number[] = [];
  let count = 0;
  for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const days = dayOrdinal(date) - dayOrdinal(start);
    let matches: boolean;
    switch (rule.type) {
      case "weekly": {
        const weeks = (days - date.getDay() + start.getDay()) / 7;
        matches =
          weeks % interval === 0 &&
          (rule.weekdays?.length ? rule.weekdays : [start.getDay()]).includes(date.getDay());
        break;
      }
      case "monthly": {
        const months =
          (date.getFullYear() - start.getFullYear()) * 12 + date.getMonth() - start.getMonth();
        matches =
          months % interval === 0 &&
          date.getDate() === Math.min(rule.monthDay ?? start.getDate(), lastDay(date));
        break;
      }
      case "yearly":
        matches =
          (date.getFullYear() - start.getFullYear()) % interval === 0 &&
          date.getMonth() + 1 === (rule.yearMonth ?? start.getMonth() + 1) &&
          date.getDate() === Math.min(rule.yearDay ?? start.getDate(), lastDay(date));
        break;
      default:
        matches =
          days % interval === 0 &&
          (rule.type !== "weekdays" || (date.getDay() !== 0 && date.getDay() !== 6));
    }
    if (!matches) continue;
    if (++count > limit) break;
    const occurrence = new Date(date);
    if (rule.excludeHolidays) {
      for (let shifted = 0; shifted < 365; shifted++) {
        if (
          occurrence.getDay() !== 0 &&
          occurrence.getDay() !== 6 &&
          !holidays.has(occurrence.getTime())
        )
          break;
        occurrence.setDate(occurrence.getDate() + 1);
      }
    }
    const timestamp = occurrence.getTime();
    if (timestamp >= windowStart.getTime() && occurrence <= end && result.at(-1) !== timestamp) {
      result.push(timestamp);
    }
  }
  return result;
}

export function nextCalendarOccurrence(
  rule: CalendarRecurrenceRule,
  from: number,
  holidays?: Set<number>
): number | null {
  const nextDay = new Date(from);
  nextDay.setHours(0, 0, 0, 0);
  nextDay.setDate(nextDay.getDate() + 1);
  const end = new Date(Math.max(rule.startDate, nextDay.getTime()));
  end.setFullYear(end.getFullYear() + Math.max(1, rule.interval) + 1);
  return calendarOccurrencesInRange(rule, nextDay.getTime(), end.getTime(), holidays)[0] ?? null;
}
