import { defineI18n } from "@tau/i18n";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/ai-notifications.zh-CN.json";
import zhTW from "./locales/ai-notifications.zh-TW.json";
import enUS from "./locales/ai-notifications.en-US.json";

const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});

export const aiNotifyText = desktopI18n.get(messages).t;
