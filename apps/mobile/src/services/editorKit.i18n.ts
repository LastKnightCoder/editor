import { defineI18n } from "@tau/i18n";
import { mobileI18n } from "./i18n";
import zhCN from "./locales/editor-kit.zh-CN.json";
import zhTW from "./locales/editor-kit.zh-TW.json";
import enUS from "./locales/editor-kit.en-US.json";
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const editorKitTranslator = mobileI18n.get(messages);
