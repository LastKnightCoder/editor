import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/import.zh-CN.json";
import zhTW from "./locales/import.zh-TW.json";
import enUS from "./locales/import.en-US.json";
export const importMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const importTranslator = desktopI18n.get(importMessages);
export function useImportI18n() {
  return useI18n(importMessages, desktopI18n);
}
