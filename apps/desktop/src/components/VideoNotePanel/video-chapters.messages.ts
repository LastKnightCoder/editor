import { defineI18n } from "@tau/i18n";
import zhCN from "./locales/video-chapters.zh-CN.json";
import zhTW from "./locales/video-chapters.zh-TW.json";
import enUS from "./locales/video-chapters.en-US.json";
export const videoChaptersMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
