import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { mobileI18n } from "../../services/i18n";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";

const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type QuickCreateMessageKey = Parameters<typeof messages.ref>[0];
export const quickCreateTranslator = mobileI18n.get(messages);
export function useQuickCreateI18n() {
  return useI18n(messages, mobileI18n);
}
