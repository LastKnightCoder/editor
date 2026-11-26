import type { Translator } from "@tau/i18n";
import { getDiaryDateKey, getBaseDateFromDiaryKey, type DiaryPeriod } from "./dateKey";
import type { MobileDiaryKey } from "./i18n";
import { getTodayDateKey } from "./feedUtils";

export function describeDiaryPeriod(
  period: DiaryPeriod,
  language: { locale: string; t: Translator<MobileDiaryKey>["t"] }
): { title: string; sub: string } {
  const { mode, baseDate } = period;
  const { locale, t } = language;
  const [year, month, day] = baseDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (mode === "daily") {
    const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date);
    return {
      title: new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" }).format(date),
      sub:
        getDiaryDateKey(mode, baseDate) === getTodayDateKey()
          ? t("period.today", { weekday })
          : weekday,
    };
  }
  if (mode === "weekly") {
    const key = getDiaryDateKey(mode, baseDate);
    const [y, m, d] = getBaseDateFromDiaryKey(mode, key).split("-").map(Number);
    const start = new Date(y, m - 1, d);
    const end = new Date(y, m - 1, d + 6);
    return {
      title: t("period.week", { amount: Number(key.split("W")[1]).toLocaleString(locale) }),
      sub: new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" }).formatRange(
        start,
        end
      ),
    };
  }
  return {
    title: new Intl.DateTimeFormat(locale, { month: "long" }).format(date),
    sub: new Intl.DateTimeFormat(locale, { year: "numeric" }).format(date),
  };
}
export function monthLabel(key: string, locale: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(
    new Date(year, month - 1, 1)
  );
}
export function weekLabels(locale: string): string[] {
  return Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(locale, { weekday: "narrow" }).format(new Date(2026, 0, 5 + index))
  );
}
