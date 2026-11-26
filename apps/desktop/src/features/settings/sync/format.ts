export function formatSyncTime(time: number | null | undefined, locale: string): string {
  return time
    ? new Intl.DateTimeFormat(locale, {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(time)
    : "—";
}
export function formatSyncFileSize(size: number | null | undefined, locale: string): string {
  if (!size || size <= 0) return "—";
  const format = (value: number, digits: number) =>
    value.toLocaleString(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      useGrouping: false,
    });
  if (size < 1024) return `${format(size, 0)}B`;
  if (size < 1024 * 1024) return `${format(size / 1024, 1)}KB`;
  return `${format(size / 1024 / 1024, 1)}MB`;
}
