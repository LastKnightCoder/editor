import type { PomodoroPreset } from "@/types";
import { MINUTE_MS, startOfDay, DAY_MS } from "./model";
import { quickRanges, type DayWindow, type QuickKey } from "./range";
import type { PomodoroMessageKey } from "./i18n";
import type { TranslationValues } from "@tau/i18n";

export function createPomodoroFormatting(
  locale: string,
  t: (key: PomodoroMessageKey, values?: TranslationValues) => string
) {
  const numberFormat = new Intl.NumberFormat(locale, {
    useGrouping: false,
    maximumFractionDigits: 20,
  });
  const number = (value: number) => numberFormat.format(value);
  const shortDate = new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" });
  const longDate = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const weekdayFormat = new Intl.DateTimeFormat(locale, { weekday: "short" });
  const monthFormat = new Intl.DateTimeFormat(locale, { month: "short" });
  const monthYearFormat = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" });
  const monthDay = (ts: number, year = false) => (year ? longDate : shortDate).format(ts);
  const weekday = (ts: number) => weekdayFormat.format(ts);
  const isYearKey = (key: QuickKey): key is `year-${number}` => key.startsWith("year-");
  const quickLabel = (key: QuickKey): string =>
    isYearKey(key) ? t("format.year", { year: key.slice(5) }) : t(`format.${key}`);
  return {
    monthName(month: number) {
      return monthFormat.format(new Date(2000, month, 1));
    },
    monthYear(year: number, month: number) {
      return monthYearFormat.format(new Date(year, month, 1));
    },
    durationDetail(ms: number) {
      const minutes = Math.round(ms / MINUTE_MS),
        hours = Math.floor(minutes / 60),
        rest = minutes % 60;
      return hours === 0
        ? t("format.durationMinutes", { minutes: number(minutes) })
        : rest
          ? t("format.durationHoursMinutes", { hours: number(hours), minutes: number(rest) })
          : t("format.durationHours", { hours: number(hours) });
    },
    weekday,
    monthDay,
    weekdayFromMonday(index: number) {
      return weekday(new Date(2023, 0, 2 + index).getTime());
    },
    day(ts: number, now: number) {
      const offset = Math.round((startOfDay(ts) - startOfDay(now)) / DAY_MS);
      return offset === 0
        ? t("format.dayToday")
        : offset === -1
          ? t("format.dayYesterday")
          : offset === -2
            ? t("format.dayBeforeYesterday")
            : monthDay(ts);
    },
    presetShort(preset: Pick<PomodoroPreset, "mode" | "durationMin">) {
      return preset.mode === "countdown" ? `${number(preset.durationMin)}′` : t("format.countup");
    },
    quickLabel,
    windowLabel(window: DayWindow, key: QuickKey | null, now: number, earliest: number | null) {
      const known =
        key && quickRanges(now, earliest).some(range => range !== "-" && range.key === key);
      if (known && key) return quickLabel(key);
      const year = new Date(now).getFullYear();
      const withYear =
        new Date(window.from).getFullYear() !== year || new Date(window.to).getFullYear() !== year;
      return window.from === window.to
        ? monthDay(window.from, withYear)
        : `${monthDay(window.from, withYear)} – ${monthDay(window.to, withYear)}`;
    },
  };
}
