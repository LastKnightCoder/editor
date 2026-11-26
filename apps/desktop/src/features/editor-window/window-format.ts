import dayjs from "dayjs";
import type { EditorWindowTranslator } from "./window.i18n";

export function windowTimestamp(
  timestamp: number,
  locale: string,
  t: EditorWindowTranslator["t"],
  now = Date.now()
): string {
  const date = dayjs(timestamp);
  const today = dayjs(now);
  const diff = dayjs(today.format("YYYY-MM-DD")).diff(dayjs(date.format("YYYY-MM-DD")), "day");
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(timestamp);
  if (diff < 1) return time;
  if (diff < 3)
    return t("date.relativeTime", {
      date: new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-diff, "day"),
      time,
    });
  return new Intl.DateTimeFormat(locale, {
    ...(date.year() === today.year() ? {} : { year: "numeric" as const }),
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(timestamp);
}
