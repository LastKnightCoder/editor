import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { mobileI18n } from "../services/i18n";
import zhCN from "./locales/video.zh-CN.json";
import zhTW from "./locales/video.zh-TW.json";
import enUS from "./locales/video.en-US.json";
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export function useMobileVideoI18n() {
  return useI18n(messages, mobileI18n);
}
