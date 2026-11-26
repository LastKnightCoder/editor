import { defineI18n } from "@tau/i18n";
import zhCN from "./locales/av.zh-CN.json";
import zhTW from "./locales/av.zh-TW.json";
import enUS from "./locales/av.en-US.json";
export const whiteboardAvMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
