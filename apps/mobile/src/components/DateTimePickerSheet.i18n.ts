import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { mobileI18n } from "../services/i18n";
import zhCN from "./locales/date-time-picker.zh-CN.json";
import zhTW from "./locales/date-time-picker.zh-TW.json";
import enUS from "./locales/date-time-picker.en-US.json";
export const dateTimePickerMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export function useDateTimePickerI18n() {
  return useI18n(dateTimePickerMessages, mobileI18n);
}
