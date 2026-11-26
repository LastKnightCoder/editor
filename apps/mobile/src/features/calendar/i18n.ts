import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { mobileI18n } from "../../services/i18n";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";

export const calendarMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type CalendarMessageKey = Parameters<typeof calendarMessages.ref>[0];
export const calendarTranslator = mobileI18n.get(calendarMessages);
export function useCalendarI18n() {
  return useI18n(calendarMessages, mobileI18n);
}
