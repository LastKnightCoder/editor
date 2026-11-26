import { defineI18n } from "@tau/i18n";
import zhCN from "./locales/watch.zh-CN.json";
import zhTW from "./locales/watch.zh-TW.json";
import enUS from "./locales/watch.en-US.json";
export const videoWatchMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
