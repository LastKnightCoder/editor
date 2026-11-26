import { defineI18n } from "@tau/i18n";
import zhCN from "./locales/ask.zh-CN.json";
import zhTW from "./locales/ask.zh-TW.json";
import enUS from "./locales/ask.en-US.json";
export const askMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type SuggestionKey = Extract<Parameters<typeof askMessages.ref>[0], `suggestion.${string}`>;
