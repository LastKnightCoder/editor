import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { mobileI18n } from "../../services/i18n";
import zhCN from "./locales/ask.zh-CN.json";
import zhTW from "./locales/ask.zh-TW.json";
import enUS from "./locales/ask.en-US.json";

const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type SuggestionKey = Extract<Parameters<typeof messages.ref>[0], `suggestion.${string}`>;
export function useAskI18n() {
  return useI18n(messages, mobileI18n);
}
