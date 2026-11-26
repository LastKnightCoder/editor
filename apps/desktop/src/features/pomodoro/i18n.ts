import { createPomodoroFormatting } from "./format";
import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n as runtime } from "@/app/i18n/runtime";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";
export const pomodoroMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type PomodoroMessageKey = Parameters<typeof pomodoroMessages.ref>[0];
export const pomodoroTranslator = runtime.get(pomodoroMessages);
export const pomoText = pomodoroTranslator.t;
const numberFormats = new Map<string, Intl.NumberFormat>();
export function pomoValue(value: unknown): string {
  if (typeof value !== "number") return String(value);
  const locale = runtime.getSnapshot();
  let format = numberFormats.get(locale);
  if (!format) {
    format = new Intl.NumberFormat(locale, { useGrouping: false, maximumFractionDigits: 20 });
    numberFormats.set(locale, format);
  }
  return format.format(value);
}
export function usePomodoroI18n() {
  return useI18n(pomodoroMessages, runtime);
}
export const getPomodoroLocale = runtime.getSnapshot;

const formats = new Map<string, ReturnType<typeof createPomodoroFormatting>>();
const format = () => {
  const locale = runtime.getSnapshot();
  let value = formats.get(locale);
  if (!value) {
    value = createPomodoroFormatting(locale, pomoText);
    formats.set(locale, value);
  }
  return value;
};
export const pomoFormat = {
  monthName: (month: number) => format().monthName(month),
  monthYear: (year: number, month: number) => format().monthYear(year, month),
  durationDetail: (ms: number) => format().durationDetail(ms),
  weekday: (ts: number) => format().weekday(ts),
  weekdayFromMonday: (index: number) => format().weekdayFromMonday(index),
  monthDay: (ts: number, year = false) => format().monthDay(ts, year),
  day: (ts: number, now: number) => format().day(ts, now),
  presetShort: (preset: Parameters<ReturnType<typeof format>["presetShort"]>[0]) =>
    format().presetShort(preset),
  quickLabel: (key: Parameters<ReturnType<typeof format>["quickLabel"]>[0]) =>
    format().quickLabel(key),
  windowLabel: (...args: Parameters<ReturnType<typeof format>["windowLabel"]>) =>
    format().windowLabel(...args),
};
