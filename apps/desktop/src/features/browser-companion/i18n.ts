import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";

export const browserCompanionMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const browserCompanionTranslator = desktopI18n.get(browserCompanionMessages);
export type BrowserCompanionTranslator = typeof browserCompanionTranslator.t;
export function useBrowserCompanionI18n() {
  return useI18n(browserCompanionMessages, desktopI18n);
}
