import { useFlashcardsI18n } from "./i18n";
import type { Flashcard } from "@/types";
import { HOUR_MS, DAY_MS, dayDiff, type DueTone } from "./model";
export type FlashcardsFormatContext = Pick<ReturnType<typeof useFlashcardsI18n>, "locale" | "t">;
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
export function formatSpan(ms: number, { locale, t }: FlashcardsFormatContext): string {
  if (ms < HOUR_MS)
    return t("span.minutes", {
      count: Math.max(1, Math.round(ms / 60_000)),
      amount: Math.max(1, Math.round(ms / 60_000)).toLocaleString(locale),
    });
  if (ms < DAY_MS)
    return t("span.hours", {
      count: Math.round(ms / HOUR_MS),
      amount: Math.round(ms / HOUR_MS).toLocaleString(locale),
    });
  if (ms < 30 * DAY_MS)
    return t("span.days", {
      count: Math.round(ms / DAY_MS),
      amount: Math.round(ms / DAY_MS).toLocaleString(locale),
    });
  return t("span.months", {
    count: Math.round(ms / (30 * DAY_MS)),
    amount: Math.round(ms / (30 * DAY_MS)).toLocaleString(locale),
  });
}
export function dueText(
  card: Flashcard,
  now: number,
  { locale, t }: FlashcardsFormatContext
): { text: string; tone: DueTone } {
  if (card.status === "suspended") return { text: t("ui.suspended"), tone: "muted" };
  if (card.dueTime <= now) {
    const late = -dayDiff(card.dueTime, now);
    return late > 0
      ? {
          text: t("due.overdue", { count: late, amount: late.toLocaleString(locale) }),
          tone: "late",
        }
      : { text: t("due.now"), tone: "now" };
  }
  const days = dayDiff(card.dueTime, now);
  const date = new Date(card.dueTime);
  const hm = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  if (days === 0) return { text: t("due.today", { time: hm }), tone: "later" };
  if (days === 1) return { text: t("due.tomorrow", { time: hm }), tone: "later" };
  if (days < 7)
    return {
      text: t("interval.days", { count: days, amount: days.toLocaleString(locale) }),
      tone: "later",
    };
  return { text: monthDay(date, locale), tone: "later" };
}
