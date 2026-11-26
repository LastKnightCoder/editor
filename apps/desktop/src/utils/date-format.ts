import type { TodoRecurrence } from "@/types";
import { dayDiff, dayLabelKind, isDateOnlyTs, mondayFirstWeekdays } from "./dayWords";
import { getDateTranslator } from "./date-i18n";

export function monthDay(timestamp: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" }).format(timestamp);
}
export function weekday(
  timestamp: number,
  locale: string,
  width: "short" | "long" | "narrow" = "short"
): string {
  return new Intl.DateTimeFormat(locale, { weekday: width }).format(timestamp);
}
export function weekdayName(
  day: number,
  locale: string,
  width: "short" | "long" | "narrow" = "short"
): string {
  return weekday(new Date(2026, 0, 4 + day).getTime(), locale, width);
}
export function dayWord(timestamp: number, now: number, locale: string): string {
  const kind = dayLabelKind(timestamp, now);
  if (kind === "relative")
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
      dayDiff(timestamp, now),
      "day"
    );
  return kind === "weekday" ? weekday(timestamp, locale) : monthDay(timestamp, locale);
}
export function dateTimeWord(timestamp: number, now: number, locale: string): string {
  const date = dayWord(timestamp, now, locale);
  if (isDateOnlyTs(timestamp)) return date;
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(timestamp);
  return getDateTranslator(locale).t("date.time", { date, time });
}
export function nextWeekdayLabel(day: number, locale: string): string {
  const width = new Intl.Locale(locale).language === "zh" ? "narrow" : "long";
  return getDateTranslator(locale).t("date.nextWeekday", {
    weekday: weekdayName(day, locale, width),
  });
}
export function recurrenceText(recurrence: TodoRecurrence, locale: string): string {
  const { t } = getDateTranslator(locale);
  const count = Math.max(1, recurrence.interval || 1);
  const amount = count.toLocaleString(locale);
  const start = new Date(recurrence.startDate);
  switch (recurrence.type) {
    case "daily":
      return count === 1 ? t("recurrence.daily") : t("recurrence.everyDays", { count, amount });
    case "weekdays":
      return t("recurrence.weekdays");
    case "weekly": {
      const days = recurrence.weekdays?.length ? recurrence.weekdays : [start.getDay()];
      const width = new Intl.Locale(locale).language === "zh" ? "narrow" : "long";
      const names = mondayFirstWeekdays(days).map(day => weekdayName(day, locale, width));
      const list = new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(
        names
      );
      return t(count === 1 ? "recurrence.weekly" : "recurrence.everyWeeks", {
        days: list,
        count,
        amount,
      });
    }
    case "monthly":
      return t(count === 1 ? "recurrence.monthly" : "recurrence.everyMonths", {
        day: (recurrence.monthDay ?? start.getDate()).toLocaleString(locale),
        count,
        amount,
      });
    case "yearly":
      return t("recurrence.yearly", {
        month: new Intl.DateTimeFormat(locale, { month: "long" }).format(
          new Date(2000, (recurrence.yearMonth ?? start.getMonth() + 1) - 1, 1)
        ),
        day: (recurrence.yearDay ?? start.getDate()).toLocaleString(locale),
      });
    default:
      return t("recurrence.everyDays", { count, amount });
  }
}
