import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./reading-locales/zh-CN.json";
import zhTW from "./reading-locales/zh-TW.json";
import enUS from "./reading-locales/en-US.json";
export const readingMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const readingTranslator = desktopI18n.get(readingMessages);
export function useReadingI18n() {
  return useI18n(readingMessages, desktopI18n);
}
