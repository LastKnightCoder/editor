import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "./i18n/runtime";
import zhCN from "./locales/features.zh-CN.json";
import zhTW from "./locales/features.zh-TW.json";
import enUS from "./locales/features.en-US.json";
export const featureMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type FeatureCopyKey = Parameters<typeof featureMessages.ref>[0];
export const featureTranslator = desktopI18n.get(featureMessages);
export function useFeatureI18n() {
  return useI18n(featureMessages, desktopI18n);
}
