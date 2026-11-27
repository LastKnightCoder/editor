import { defineI18n } from "@tau/i18n";
import zhCN from "./locales/content-edit.zh-CN.json";
import zhTW from "./locales/content-edit.zh-TW.json";
import enUS from "./locales/content-edit.en-US.json";
export const contentEditMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
