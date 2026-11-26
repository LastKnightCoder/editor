import type { Translator } from "@tau/i18n";
import type { QuickAddResult as TodoQuickAdd } from "@/features/todos/quickAdd";
import type { QuickAddResult as EventQuickAdd } from "@/features/schedule/quickAdd";
import { dayDiff, daysLeftInWeek, isDateOnlyTs } from "@/utils/dayWords";
import type { QuickAddMessageKey } from "./i18n";

type Language = { locale: string; t: Translator<QuickAddMessageKey>["t"] };
const clock = (ts: number, locale: string) =>
  new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    ts
  );

export function quickAddDay(ts: number, now: number, locale: string): string {
  const diff = dayDiff(ts, now);
  if (diff === 0 || diff === 1 || diff === 2 || diff === -1)
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(diff, "day");
  if (diff > 0 && diff <= daysLeftInWeek(now))
    return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(ts);
  return new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" }).format(ts);
}
function dateTime(ts: number, now: number, { t, locale }: Language): string {
  const date = quickAddDay(ts, now, locale);
  return isDateOnlyTs(ts) ? date : t("date.time", { date, time: clock(ts, locale) });
}
export function describeTodoQuickAdd(
  parsed: TodoQuickAdd,
  now: number,
  language: Language
): string {
  const { t, locale } = language;
  if (parsed.schedule) {
    const { startDate, startTime, endTime } = parsed.schedule;
    return t("todo.scheduled", {
      start: dateTime(startDate + startTime * 60_000, now, language),
      end: clock(startDate + endTime * 60_000, locale),
    });
  }
  if (parsed.type === "deadline" && parsed.dueAt !== null)
    return t("todo.deadline", { when: dateTime(parsed.dueAt, now, language) });
  if (parsed.type !== "recurring" || parsed.recurrence === null) return t("todo.normal");
  const recurrence = parsed.recurrence;
  const start = new Date(now);
  let rule: string;
  switch (recurrence.type) {
    case "weekdays":
      rule = t("recurrence.weekdays");
      break;
    case "weekly": {
      const days = recurrence.weekdays?.length ? recurrence.weekdays : [start.getDay()];
      const sorted = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
      const formatter = new Intl.DateTimeFormat(locale, {
        weekday: locale.startsWith("zh") ? "narrow" : "long",
      });
      const names = sorted.map(day => formatter.format(new Date(2026, 0, 4 + day)));
      rule = t("recurrence.weekly", {
        days: new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(names),
      });
      break;
    }
    case "monthly":
      rule = t("recurrence.monthly", {
        day: (recurrence.monthDay ?? start.getDate()).toLocaleString(locale),
      });
      break;
    case "yearly":
      rule = t("recurrence.yearly", {
        date: new Intl.DateTimeFormat(locale, { month: "long", day: "numeric" }).format(now),
      });
      break;
    default:
      rule = t("recurrence.daily");
  }
  return t("todo.recurring", { rule });
}
export function describeEventQuickAdd(
  parsed: EventQuickAdd,
  now: number,
  language: Language,
  showDate = true
): string {
  const { t, locale } = language;
  const minuteTime = (minutes: number) =>
    `${Math.floor(minutes / 60).toLocaleString(locale, { minimumIntegerDigits: 2, useGrouping: false })}:${(minutes % 60).toLocaleString(locale, { minimumIntegerDigits: 2, useGrouping: false })}`;
  const time =
    parsed.startTime !== null && parsed.endTime !== null
      ? t("event.range", { start: minuteTime(parsed.startTime), end: minuteTime(parsed.endTime) })
      : t("event.allDay");
  return showDate ? t("event.when", { date: quickAddDay(parsed.date, now, locale), time }) : time;
}
