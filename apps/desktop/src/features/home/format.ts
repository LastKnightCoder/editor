import { dayDiff, daysLeftInWeek, isDateOnlyTs } from "@/utils/dayWords";
import { desktopLocaleSource } from "@/app/i18n/runtime";
import { homeTranslator } from "./i18n";

export function minutesToHM(minutes: number): string {
  const format = new Intl.NumberFormat(desktopLocaleSource.getSnapshot());
  if (minutes < 60) return homeTranslator.t("duration.minutes", { value: format.format(minutes) });
  const hours = Math.floor(minutes / 60);
  return hours >= 10
    ? homeTranslator.t("duration.hours", { value: format.format(hours) })
    : homeTranslator.t("duration.hoursMinutes", {
        hours: format.format(hours),
        minutes: format.format(minutes % 60),
      });
}

export function relativeDays(timestamp: number, now = Date.now()): string {
  const days = Math.max(0, -dayDiff(timestamp, now));
  const locale = desktopLocaleSource.getSnapshot();
  if (days <= 1)
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-days, "day");
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
  if (days < 7) return format.format(-days, "day");
  if (days < 30) return format.format(-Math.floor(days / 7), "week");
  return format.format(-Math.floor(days / 30), "month");
}

export function dueDateText(timestamp: number, now = Date.now()): string {
  const locale = desktopLocaleSource.getSnapshot();
  const diff = dayDiff(timestamp, now);
  const date =
    diff >= -1 && diff <= 2
      ? new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(diff, "day")
      : diff > 0 && diff <= daysLeftInWeek(now)
        ? new Intl.DateTimeFormat(locale, { weekday: "short" }).format(timestamp)
        : new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" }).format(timestamp);
  if (isDateOnlyTs(timestamp)) return date;
  return `${date} ${new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(timestamp)}`;
}

export function eventTime(event: { allDay: boolean; startTime: number; endTime?: number }): string {
  if (event.allDay) return homeTranslator.t("calendar.allDay");
  const clock = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return `${clock(event.startTime)}${event.endTime != null ? `-${clock(event.endTime)}` : ""}`;
}
