import { formatListDate } from "@/features/shared/list/format";

export function formatSwitcherDate(ts: number, locale: string): string {
  const date = new Date(ts);
  const now = new Date();
  if (date.getFullYear() === now.getFullYear()) {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    if (ts >= today) return relative.format(0, "day");
    if (ts >= today - 86_400_000) return relative.format(-1, "day");
  }
  return formatListDate(ts, locale);
}
