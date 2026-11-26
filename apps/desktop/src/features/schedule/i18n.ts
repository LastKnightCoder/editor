import { ScheduleError } from "./errors";
import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n as runtime } from "@/app/i18n/runtime";
import { createScheduleFormatting } from "./format";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";

export const scheduleMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type ScheduleMessageKey = Parameters<typeof scheduleMessages.ref>[0];
export const scheduleTranslator = runtime.get(scheduleMessages);
export const scheduleText = scheduleTranslator.t;
export function useScheduleI18n() {
  return useI18n(scheduleMessages, runtime);
}
const formats = new Map<string, ReturnType<typeof createScheduleFormatting>>();
function format() {
  const locale = runtime.getSnapshot();
  let value = formats.get(locale);
  if (!value) {
    value = createScheduleFormatting(locale, scheduleText);
    formats.set(locale, value);
  }
  return value;
}
export const scheduleValue = (value: unknown) =>
  typeof value === "number" ? format().number(value) : String(value);
export const scheduleFormat = {
  header: (...args: Parameters<ReturnType<typeof format>["header"]>) => format().header(...args),
  weekday: (ts: number) => format().weekday(ts),
  weekdayFromMonday: (index: number) => format().weekdayFromMonday(index),
  monthDay: (ts: number) => format().monthDay(ts),
  monthDayWeekday: (ts: number) => format().monthDayWeekday(ts),
  shortDate: (ts: number) => format().shortDate(ts),
  yearMonth: (ts: number) => format().yearMonth(ts),
  dateRange: (start: number, end: number | null) => format().dateRange(start, end),
  focus: (minutes: number) => format().focus(minutes),
};

export function scheduleErrorText(error: unknown, fallback: ScheduleMessageKey): string {
  return error instanceof ScheduleError
    ? scheduleText(`error.${error.code}`)
    : error instanceof Error
      ? error.message
      : scheduleText(fallback);
}
