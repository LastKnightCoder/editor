import { defineI18n, type Translator } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { useWhiteboardI18nRuntime } from "./i18n-context";
import zhCN from "./locales/ui.zh-CN.json";
import zhTW from "./locales/ui.zh-TW.json";
import enUS from "./locales/ui.en-US.json";
export const uiMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type UiTranslate = Translator<Parameters<typeof uiMessages.ref>[0]>["t"];
export function useWhiteboardUiI18n() {
  return useI18n(uiMessages, useWhiteboardI18nRuntime());
}
