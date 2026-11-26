import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/composer.zh-CN.json";
import zhTW from "./locales/composer.zh-TW.json";
import enUS from "./locales/composer.en-US.json";
export const composerMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export function useComposerI18n() {
  return useI18n(composerMessages, desktopI18n);
}
