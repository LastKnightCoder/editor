import { defineI18n, type Translator } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/read.zh-CN.json";
import zhTW from "./locales/read.zh-TW.json";
import enUS from "./locales/read.en-US.json";
export const toolReadMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type ReadTranslate = Translator<Parameters<typeof toolReadMessages.ref>[0]>["t"];
export function useToolReadI18n() {
  return useI18n(toolReadMessages, desktopI18n);
}
