import { cardsTranslator } from "./i18n";

export function cardTimeDisplay(ts: number, locale: string): string {
  if (!ts) return "";
  const normalized = ts > 0 && ts < 1_000_000_000_000 ? ts * 1000 : ts;
  const date = new Date(normalized);
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  if (date.toDateString() === now.toDateString()) return time;
  if (date.toDateString() === yesterday.toDateString())
    return cardsTranslator.t("yesterday", { time });
  return new Intl.DateTimeFormat(locale, {
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
    month: "numeric",
    day: "numeric",
  }).format(date);
}

export function cardDateTime(ts: number, locale: string): string {
  if (!ts) return "--";
  const date = new Date(ts > 0 && ts < 1_000_000_000_000 ? ts * 1000 : ts);
  return new Intl.DateTimeFormat(locale, {
    year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}
