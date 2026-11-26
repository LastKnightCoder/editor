import { useFlashcardI18n } from "./i18n";
export type FlashcardFormatContext = Pick<ReturnType<typeof useFlashcardI18n>, "locale" | "t">;
export function weekday(
  date: number | Date,
  locale: string,
  width: "short" | "narrow" = "short"
): string {
  return new Intl.DateTimeFormat(locale, { weekday: width }).format(date);
}
export function monthDay(date: number | Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" }).format(date);
}
export function calendarDate(date: number | Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" }).format(
    date
  );
}
