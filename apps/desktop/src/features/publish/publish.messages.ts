import { defineI18n } from "@tau/i18n";
import zhCN from "./locales/publish.zh-CN.json";
import zhTW from "./locales/publish.zh-TW.json";
import enUS from "./locales/publish.en-US.json";
export const publishMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
