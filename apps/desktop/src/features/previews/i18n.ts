import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/blockPreview.zh-CN.json";
import zhTW from "./locales/blockPreview.zh-TW.json";
import enUS from "./locales/blockPreview.en-US.json";

export const blockPreviewMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});

export function useBlockPreviewI18n() {
  return useI18n(blockPreviewMessages, desktopI18n);
}
