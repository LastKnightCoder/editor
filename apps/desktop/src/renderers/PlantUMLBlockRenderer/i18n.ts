import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/uml.zh-CN.json";
import zhTW from "./locales/uml.zh-TW.json";
import enUS from "./locales/uml.en-US.json";
export const umlMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export function useUmlI18n() {
  return useI18n(umlMessages, desktopI18n);
}
