import dayjs from "dayjs";

export function formatListDate(ts: number, locale: string, includeYear = true): string {
  const date = new Date(ts);
  return new Intl.DateTimeFormat(locale, {
    year: includeYear && date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    month: "numeric",
    day: "numeric",
  }).format(date);
}

export function formatRecentDateTime(
  ts: number,
  locale: string,
  relativeTime: (day: string, time: string) => string
): string {
  const date = dayjs(ts);
  const now = dayjs();
  const days = dayjs(now.format("YYYY-MM-DD")).diff(dayjs(date.format("YYYY-MM-DD")), "day");
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(ts);
  if (days < 1) return time;
  if (days < 3)
    return relativeTime(
      new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-days, "day"),
      time
    );
  return new Intl.DateTimeFormat(locale, {
    year: date.year() === now.year() ? undefined : "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(ts);
}

export function formatRelativeTime(ts: number, locale: string, now = Date.now()): string {
  const start = (value: number) => {
    const date = new Date(value);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  };
  const days = Math.floor((start(now) - start(ts)) / 86_400_000);
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: days <= 1 ? "auto" : "always" });
  if (days <= 0) return relative.format(0, "day");
  if (days === 1) return relative.format(-1, "day");
  if (days < 7) return relative.format(-days, "day");
  if (days < 30) return relative.format(-Math.floor(days / 7), "week");
  return relative.format(-Math.floor(days / 30), "month");
}

export function formatCompactCount(value: number, locale: string): string {
  return new Intl.NumberFormat(
    locale,
    value >= 10000
      ? {
          notation: "compact",
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }
      : {}
  ).format(value);
}
