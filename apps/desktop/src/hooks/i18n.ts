import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/feedback.zh-CN.json";
import zhTW from "./locales/feedback.zh-TW.json";
import enUS from "./locales/feedback.en-US.json";

export const hooksFeedbackMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});

export function useHooksFeedbackI18n() {
  return useI18n(hooksFeedbackMessages, desktopI18n);
}
