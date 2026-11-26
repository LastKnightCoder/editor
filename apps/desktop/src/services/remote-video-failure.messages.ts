import { defineI18n } from "@tau/i18n";
import zhCN from "./locales/remote-video-failure.zh-CN.json";
import zhTW from "./locales/remote-video-failure.zh-TW.json";
import enUS from "./locales/remote-video-failure.en-US.json";
export const remoteVideoFailureMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
