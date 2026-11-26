export function formatCacheBytes(bytes: number, locale: string): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes,
    unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value >= 100 || unit === 0 ? 0 : 1;
  return `${value.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: false })} ${units[unit]}`;
}
