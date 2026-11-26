import { defineI18n } from "@tau/i18n";
import zhCN from "./locales/media-progress.zh-CN.json";
import zhTW from "./locales/media-progress.zh-TW.json";
import enUS from "./locales/media-progress.en-US.json";
export const mediaProgressMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
