import { defineI18n } from "@tau/i18n";
import zhCN from "./locales/video-selector.zh-CN.json";
import zhTW from "./locales/video-selector.zh-TW.json";
import enUS from "./locales/video-selector.en-US.json";
export const videoSelectorMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
