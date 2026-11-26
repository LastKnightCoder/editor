import { defineI18n, type Translator } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";

export const whiteboardMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const whiteboardTranslator = desktopI18n.get(whiteboardMessages);
export type WhiteboardTranslator = Translator<Parameters<typeof whiteboardMessages.ref>[0]>;
export function useWhiteboardI18n() {
  return useI18n(whiteboardMessages, desktopI18n);
}
