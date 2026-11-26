import { getDateTranslator } from "./date-i18n";

type RelativeAge =
  | { unit: "now" }
  | { unit: "minute" | "hour" | "day" | "month" | "year"; value: number };

export function relativeAge(ts: number, now = Date.now()): RelativeAge {
  const diff = now - ts;
  if (diff < 60_000) return { unit: "now" };
  if (diff < 3_600_000) return { unit: "minute", value: Math.floor(diff / 60_000) };
  if (diff < 86_400_000) return { unit: "hour", value: Math.floor(diff / 3_600_000) };
  const days = Math.floor(diff / 86_400_000);
  if (days < 30) return { unit: "day", value: days };
  if (days < 365) return { unit: "month", value: Math.floor(days / 30) };
  return { unit: "year", value: Math.floor(days / 365) };
}

export function formatAgo(ts: number, locale: string, now = Date.now()): string {
  const age = relativeAge(ts, now);
  if (age.unit === "now") return getDateTranslator(locale).t("date.justNow");
  if (!Number.isFinite(age.value)) return String(age.value);
  return new Intl.RelativeTimeFormat(locale, { numeric: "always" }).format(-age.value, age.unit);
}
