import { keyDate } from "./model";

export function weekdayOf(key: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(keyDate(key));
}
export function formatTime(ts: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(ts);
}
export function relativeDay(key: string, today: string, locale: string): string {
  const off = Math.round((keyDate(today).getTime() - keyDate(key).getTime()) / 86_400_000);
  return off >= 0 && off < 7
    ? new Intl.RelativeTimeFormat(locale, { numeric: off <= 1 ? "auto" : "always" }).format(
        -off,
        "day"
      )
    : "";
}
export function shortDate(key: string, today: string, locale: string): string {
  const date = keyDate(key);
  return new Intl.DateTimeFormat(locale, {
    year: date.getFullYear() === keyDate(today).getFullYear() ? undefined : "numeric",
    month: "numeric",
    day: "numeric",
  }).format(date);
}
export function monthLabel(key: string, locale: string, year = false): string {
  return new Intl.DateTimeFormat(locale, {
    year: year ? "numeric" : undefined,
    month: "short",
  }).format(keyDate(key + "-01"));
}
export function weekLabels(locale: string): string[] {
  return Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(new Date(2026, 0, 5 + index))
  );
}
