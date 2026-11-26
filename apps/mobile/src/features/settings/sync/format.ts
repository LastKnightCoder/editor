export function formatSyncFileSize(size: number | null, locale: string): string {
  if (!size || size <= 0) return "";
  const format = (value: number, digits: number) =>
    value.toLocaleString(locale, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
      useGrouping: false,
    });
  if (size < 1024) return `${format(size, 0)} B`;
  if (size < 1024 * 1024) return `${format(size / 1024, 0)} KB`;
  return `${format(size / 1024 / 1024, 1)} MB`;
}
