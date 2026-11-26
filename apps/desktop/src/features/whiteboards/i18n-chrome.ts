import { defineI18n, type Translator } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/chrome.zh-CN.json";
import zhTW from "./locales/chrome.zh-TW.json";
import enUS from "./locales/chrome.en-US.json";

export const whiteboardChromeMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const whiteboardChromeTranslator = desktopI18n.get(whiteboardChromeMessages);
export type WhiteboardChromeTranslator = Translator<
  Parameters<typeof whiteboardChromeMessages.ref>[0]
>;
export function useWhiteboardChromeI18n() {
  return useI18n(whiteboardChromeMessages, desktopI18n);
}
