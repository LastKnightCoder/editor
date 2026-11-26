import { defineI18n } from "@tau/i18n";
import zhCN from "./locales/tts.zh-CN.json";
import zhTW from "./locales/tts.zh-TW.json";
import enUS from "./locales/tts.en-US.json";

export const ttsSettingsMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type TtsMessageKey = Parameters<typeof ttsSettingsMessages.ref>[0];
