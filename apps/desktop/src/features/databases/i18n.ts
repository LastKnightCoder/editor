import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";

export const databasesMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type DatabasesMessageKey = Parameters<typeof databasesMessages.ref>[0];
export const databasesTranslator = desktopI18n.get(databasesMessages);
export function useDatabasesI18n() {
  return useI18n(databasesMessages, desktopI18n);
}
