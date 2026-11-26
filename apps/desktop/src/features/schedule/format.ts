import type { TranslationValues } from "@tau/i18n";
import type { CalendarViewType } from "@/types";
import { getWeekStart } from "@/utils/calendar";
import type { ScheduleMessageKey } from "./i18n";

export function createScheduleFormatting(
  locale: string,
  t: (key: ScheduleMessageKey, values?: TranslationValues) => string
) {
  const numbers = new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 20 });
  const number = (value: number) => numbers.format(value);
  const weekdays = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const monthDays = new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" });
  const fullDays = new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
  const shortDays = new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" });
  const yearMonths = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" });
  const months = new Intl.DateTimeFormat(locale, { month: "long" });
  const shortMonths = new Intl.DateTimeFormat(locale, { month: "short" });
  const weekday = (ts: number) => weekdays.format(ts);
  const monthDay = (ts: number) => monthDays.format(ts);
  const monthDayWeekday = (ts: number) => fullDays.format(ts);
  return {
    number,
    weekday,
    monthDay,
    monthDayWeekday,
    shortDate: (ts: number) => shortDays.format(ts),
    yearMonth: (ts: number) => yearMonths.format(ts),
    weekdayFromMonday: (index: number) => weekday(new Date(2023, 0, 2 + index).getTime()),
    dateRange(start: number, end: number | null) {
      return !end || new Date(end).toDateString() === new Date(start).toDateString()
        ? monthDayWeekday(start)
        : `${monthDayWeekday(start)} – ${monthDayWeekday(end)}`;
    },
    focus(minutes: number) {
      const hours = Math.floor(minutes / 60),
        rest = minutes % 60;
      const duration = `${hours ? `${number(hours)}h` : ""}${rest || !hours ? `${number(rest)}m` : ""}`;
      return t("focus.duration", { duration });
    },
    header(view: CalendarViewType, current: number) {
      const date = new Date(current),
        year = date.getFullYear();
      if (view === "day")
        return { main: monthDay(current), sub: `${weekday(current)} · ${number(year)}` };
      if (view === "week") {
        const start = new Date(getWeekStart(current));
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        return {
          main: monthDays.formatRange(start, end),
          sub: `${number(start.getFullYear())} · W${String(isoWeek(start)).padStart(2, "0")}`,
        };
      }
      return {
        main: months.format(date),
        sub: `${number(year)} · ${view === "agenda" ? t("view.agenda") : shortMonths.format(date)}`,
      };
    },
  };
}

/** ISO 周次：周一起始，含 1 月 4 日的周为第 1 周。 */
function isoWeek(monday: Date) {
  const thursday = new Date(monday);
  thursday.setDate(monday.getDate() + 3);
  const firstThursday = new Date(thursday.getFullYear(), 0, 4);
  return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86400000));
}
