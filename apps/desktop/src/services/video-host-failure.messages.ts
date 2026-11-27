import { defineI18n } from "@tau/i18n";
import zhCN from "./locales/video-host-failure.zh-CN.json";
import zhTW from "./locales/video-host-failure.zh-TW.json";
import enUS from "./locales/video-host-failure.en-US.json";
export const videoHostFailureMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
