import type { useCalendarI18n } from "./i18n";
import { CALENDAR_COLORS } from "./constants";
import { formatTime } from "./utils";

export type CalendarFormatContext = Pick<ReturnType<typeof useCalendarI18n>, "locale" | "t">;
export function weekdayLabel(date: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date);
}

export function weekdayHeaders(locale: string): { day: number; label: string }[] {
  return [1, 2, 3, 4, 5, 6, 0].map(day => ({
    day,
    label: weekdayLabel(new Date(2023, 0, 1 + day).getTime(), locale),
  }));
}

export function formatDayHead(date: number, locale: string): { day: string; weekday: string } {
  return {
    day: new Intl.DateTimeFormat(locale, { day: "numeric" }).format(date),
    weekday: weekdayLabel(date, locale),
  };
}

export function formatMonthNav(anchorDate: number, locale: string): { main: string; sub: string } {
  return {
    main: new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(anchorDate),
    sub: new Intl.DateTimeFormat(locale, { month: "long" }).format(anchorDate),
  };
}

export function formatMonthDay(date: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" }).format(date);
}

export function formatDateTimeLine(
  date: number,
  minutes: number | null,
  allDay: boolean,
  { locale, t }: CalendarFormatContext,
  missingTime: "allDay" | "omit" = "allDay"
): string {
  const time =
    allDay || (minutes === null && missingTime === "allDay")
      ? t("event.allDay")
      : minutes === null
        ? undefined
        : formatTime(minutes);
  return t(time === undefined ? "datetime.date" : "datetime.line", {
    date: formatMonthDay(date, locale),
    weekday: weekdayLabel(date, locale),
    time: time ?? "",
  });
}

export function durationLabel(
  startMinutes: number,
  endMinutes: number,
  { locale, t }: CalendarFormatContext
): string {
  const total = Math.max(0, endMinutes - startMinutes);
  const hours = (value: number) =>
    t("duration.hours", { count: value, amount: value.toLocaleString(locale) });
  const minutes = (value: number) =>
    t("duration.minutes", { count: value, amount: value.toLocaleString(locale) });
  if (total % 60 === 0) return hours(total / 60);
  if (total < 60) return minutes(total);
  if (total % 30 === 0) return hours(total / 60);
  return t("duration.mixed", {
    hours: hours(Math.floor(total / 60)),
    minutes: minutes(total % 60),
  });
}

export function calendarColorLabel(
  name: string | null | undefined,
  { t }: Pick<CalendarFormatContext, "t">
): string {
  const entry = CALENDAR_COLORS.find(entry => entry.name === name) ?? CALENDAR_COLORS[0];
  return t(entry.message);
}
