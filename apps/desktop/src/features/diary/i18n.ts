import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";

export const diaryMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type DiaryMessageKey = Parameters<typeof diaryMessages.ref>[0];
export const diaryTranslator = desktopI18n.get(diaryMessages);
export function useDiaryI18n() {
  return useI18n(diaryMessages, desktopI18n);
}
