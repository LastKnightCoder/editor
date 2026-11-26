import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { mobileI18n } from "../../services/i18n";
import zhCN from "./locales/sheet.zh-CN.json";
import zhTW from "./locales/sheet.zh-TW.json";
import enUS from "./locales/sheet.en-US.json";
export const reminderSheetMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export function useReminderSheetI18n() {
  return useI18n(reminderSheetMessages, mobileI18n);
}
