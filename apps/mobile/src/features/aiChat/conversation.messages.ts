import { defineI18n } from "@tau/i18n";
import zhCN from "./locales/conversation.zh-CN.json";
import zhTW from "./locales/conversation.zh-TW.json";
import enUS from "./locales/conversation.en-US.json";
export const conversationMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type ConversationMessageKey = Parameters<typeof conversationMessages.ref>[0];
