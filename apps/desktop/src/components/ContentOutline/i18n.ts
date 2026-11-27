import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/contentOutline.zh-CN.json";
import zhTW from "./locales/contentOutline.zh-TW.json";
import enUS from "./locales/contentOutline.en-US.json";
export const contentOutlineMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export function useContentOutlineI18n() {
  return useI18n(contentOutlineMessages, desktopI18n);
}
