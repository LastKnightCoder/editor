import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./group-dialog-locales/zh-CN.json";
import zhTW from "./group-dialog-locales/zh-TW.json";
import enUS from "./group-dialog-locales/en-US.json";
export const groupDialogMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export function useGroupDialogI18n() {
  return useI18n(groupDialogMessages, desktopI18n);
}
