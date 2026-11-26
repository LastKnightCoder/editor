import { defineI18n } from "@tau/i18n";
import zhCN from "./locales/shell.zh-CN.json";
import zhTW from "./locales/shell.zh-TW.json";
import enUS from "./locales/shell.en-US.json";
export const shellMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
