import type { StorageLocale } from "./i18n";
export function formatRelativeTime(
  time: number,
  now: number,
  { locale, t }: StorageLocale
): string {
  const diff = Math.max(0, now - time),
    minute = 60_000;
  if (diff < minute) return t("relative.now");
  if (diff < 60 * minute) {
    const count = Math.floor(diff / minute);
    return t("relative.minutes", { count, amount: count.toLocaleString(locale) });
  }
  const date = new Date(time),
    today = new Date(now);
  const hhmm = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  if (date.toDateString() === today.toDateString()) return t("relative.today", { time: hhmm });
  const yesterday = new Date(now - 86_400_000);
  if (date.toDateString() === yesterday.toDateString())
    return t("relative.yesterday", { time: hhmm });
  const format = new Intl.DateTimeFormat(locale, {
    month: locale.startsWith("zh") ? "long" : "short",
    day: "numeric",
  });
  const label = locale.startsWith("zh")
    ? format
        .formatToParts(time)
        .map(part => part.value)
        .join(" ")
    : format.format(time);
  return t("relative.date", { date: label, time: hhmm });
}
