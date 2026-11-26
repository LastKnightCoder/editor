import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { useWhiteboardI18nRuntime } from "./i18n-context";
import zhCN from "./locales/presentation.zh-CN.json";
import zhTW from "./locales/presentation.zh-TW.json";
import enUS from "./locales/presentation.en-US.json";
export const presentationMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export function usePresentationI18n() {
  return useI18n(presentationMessages, useWhiteboardI18nRuntime());
}
