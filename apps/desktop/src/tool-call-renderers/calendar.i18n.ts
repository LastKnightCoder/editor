import { defineI18n, type Translator } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/calendar.zh-CN.json";
import zhTW from "./locales/calendar.zh-TW.json";
import enUS from "./locales/calendar.en-US.json";
export const calendarToolMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type CalendarToolTranslate = Translator<Parameters<typeof calendarToolMessages.ref>[0]>["t"];
export type CalendarToolMessageKey = Parameters<typeof calendarToolMessages.ref>[0];
export function useCalendarToolI18n() {
  return useI18n(calendarToolMessages, desktopI18n);
}
