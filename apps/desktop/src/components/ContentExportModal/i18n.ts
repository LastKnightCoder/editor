import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";
export const contentExportMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type ContentExportMessageKey = Parameters<typeof contentExportMessages.ref>[0];
export const contentExportTranslator = desktopI18n.get(contentExportMessages);
export function useContentExportI18n() {
  return useI18n(contentExportMessages, desktopI18n);
}
