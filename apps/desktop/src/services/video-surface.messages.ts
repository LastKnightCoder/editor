import { defineI18n } from "@tau/i18n";
import zhCN from "./locales/video-surface.zh-CN.json";
import zhTW from "./locales/video-surface.zh-TW.json";
import enUS from "./locales/video-surface.en-US.json";
export const videoSurfaceMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
