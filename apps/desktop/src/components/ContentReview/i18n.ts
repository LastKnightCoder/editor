import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/suggestion.zh-CN.json";
import zhTW from "./locales/suggestion.zh-TW.json";
import enUS from "./locales/suggestion.en-US.json";
export const suggestionMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type SuggestionMessageKey = Parameters<typeof suggestionMessages.ref>[0];
export function useSuggestionI18n() {
  return useI18n(suggestionMessages, desktopI18n);
}
