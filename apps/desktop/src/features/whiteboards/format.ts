import type { WhiteboardItem } from "./model";
import type { WhiteboardTranslator } from "./i18n";

export function displayTitle(
  item: Pick<WhiteboardItem, "title">,
  t: WhiteboardTranslator["t"]
): string {
  return item.title.trim() || t("untitled");
}

/** Elapsed-time buckets remain independent of locale and calendar boundaries. */
export function relativeTime(
  ts: number,
  now: number,
  locale: string,
  t: WhiteboardTranslator["t"]
): string {
  const diff = now - ts;
  if (diff < 60_000) return t("time.now");
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (diff < 3_600_000) return relative.format(-Math.floor(diff / 60_000), "minute");
  if (diff < 86_400_000) return relative.format(-Math.floor(diff / 3_600_000), "hour");
  if (diff < 7 * 86_400_000) return relative.format(-Math.floor(diff / 86_400_000), "day");
  return new Intl.DateTimeFormat(locale, {
    ...(new Date(ts).getFullYear() === new Date(now).getFullYear() ? {} : { year: "numeric" }),
    month: "long",
    day: "numeric",
  }).format(ts);
}

export function fullTime(ts: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(ts);
}
