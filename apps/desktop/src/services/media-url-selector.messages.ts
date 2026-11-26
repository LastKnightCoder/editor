import { defineI18n } from "@tau/i18n";
import zhCN from "./locales/media-url-selector.zh-CN.json";
import zhTW from "./locales/media-url-selector.zh-TW.json";
import enUS from "./locales/media-url-selector.en-US.json";
export const mediaUrlSelectorMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
