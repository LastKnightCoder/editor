import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";

export const cockpitMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type CockpitMessageKey = Parameters<typeof cockpitMessages.ref>[0];
export const cockpitTranslator = desktopI18n.get(cockpitMessages);
export function useCockpitI18n() {
  return useI18n(cockpitMessages, desktopI18n);
}
