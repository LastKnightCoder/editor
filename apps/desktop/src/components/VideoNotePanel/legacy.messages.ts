import { defineI18n } from "@tau/i18n";
import zhCN from "./locales/legacy.zh-CN.json";
import zhTW from "./locales/legacy.zh-TW.json";
import enUS from "./locales/legacy.en-US.json";
export const legacyVideoMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
