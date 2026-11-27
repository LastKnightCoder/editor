import { defineI18n } from "@tau/i18n";
import zhCN from "./locales/tts-capability.zh-CN.json";
import zhTW from "./locales/tts-capability.zh-TW.json";
import enUS from "./locales/tts-capability.en-US.json";
export const ttsCapabilityMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
