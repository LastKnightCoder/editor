import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";

export const sharedDatabaseMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type SharedDatabaseMessageKey = Parameters<typeof sharedDatabaseMessages.ref>[0];
export const sharedDatabaseTranslator = desktopI18n.get(sharedDatabaseMessages);
export function useSharedDatabaseI18n() {
  return useI18n(sharedDatabaseMessages, desktopI18n);
}
