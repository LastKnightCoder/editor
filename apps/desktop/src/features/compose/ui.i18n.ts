import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/ui.zh-CN.json";
import zhTW from "./locales/ui.zh-TW.json";
import enUS from "./locales/ui.en-US.json";
export const composeUiMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const composeUiTranslator = desktopI18n.get(composeUiMessages);
export function useComposeUiI18n() {
  return useI18n(composeUiMessages, desktopI18n);
}
