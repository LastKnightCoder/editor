import type { AboutLocale } from "./i18n";
export function formatUpdateSize(bytes: number, locale: string): string {
  return `${Math.max(1, Math.round(bytes / 1024 / 1024)).toLocaleString(locale)} MB`;
}
export function formatReleaseDate(iso: string, locale: string, includeYear = false): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const format = new Intl.DateTimeFormat(locale, {
    ...(includeYear ? { year: "numeric" as const } : {}),
    month: "long",
    day: "numeric",
  });
  return locale.startsWith("zh")
    ? format
        .formatToParts(date)
        .map(part => part.value)
        .join(" ")
    : format.format(date);
}
export function formatPublishedDate(iso: string, { locale, t }: AboutLocale): string {
  const date = formatReleaseDate(iso, locale);
  return date ? t("release.published", { date }) : "";
}
