import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/presentation.zh-CN.json";
import zhTW from "./locales/presentation.zh-TW.json";
import enUS from "./locales/presentation.en-US.json";
const presentationMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export function usePresentationI18n() {
  return useI18n(presentationMessages, desktopI18n);
}
