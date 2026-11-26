import type { DocumentHistoryEntry } from "@tau/collaboration";
import type { HistoryLocale } from "./i18n";
const dateParts = { month: "long", day: "numeric" } as const;
const clock = (time: number, locale: string) =>
  new Date(time).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
const absolute = (time: number, locale: string) =>
  `${new Date(time).toLocaleDateString(locale, dateParts)} ${clock(time, locale)}`;
const minuteOfDay = (time: number) => {
  const date = new Date(time);
  return date.getHours() * 60 + date.getMinutes();
};
export function historyRelativeTime(time: number, { locale, t }: HistoryLocale, now = Date.now()) {
  const minutes = Math.round((now - time) / 60000);
  if (minutes < 1) return t("time.now");
  if (minutes < 60)
    return t("time.minutes", { count: minutes, amount: minutes.toLocaleString(locale) });
  if (minutes < 720) {
    const hours = Math.round(minutes / 60);
    return t("time.hours", { count: hours, amount: hours.toLocaleString(locale) });
  }
  return new Date(time).toLocaleDateString(locale, dateParts);
}
export function historyEntryTime(entry: DocumentHistoryEntry, locale: string) {
  return entry.startTime && minuteOfDay(entry.startTime) !== minuteOfDay(entry.time)
    ? `${absolute(entry.startTime, locale)}–${clock(entry.time, locale)}`
    : absolute(entry.time, locale);
}
export function historyDayLabel(time: number, { locale, t }: HistoryLocale, now = Date.now()) {
  const date = new Date(time),
    today = new Date(now);
  if (date.toDateString() === today.toDateString()) return t("date.today");
  const yesterday = new Date(now - 864e5);
  if (date.toDateString() === yesterday.toDateString()) return t("date.yesterday");
  return date.toLocaleDateString(locale, { ...dateParts, weekday: "short" });
}
