import { defineI18n } from "@tau/i18n";
import zhCN from "./locales/video-cache-failure.zh-CN.json";
import zhTW from "./locales/video-cache-failure.zh-TW.json";
import enUS from "./locales/video-cache-failure.en-US.json";
export const videoCacheFailureMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
