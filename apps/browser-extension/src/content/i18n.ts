import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { extensionI18n } from "../shared/i18n";
import zhCN from "./locales/connection.zh-CN.json";
import zhTW from "./locales/connection.zh-TW.json";
import enUS from "./locales/connection.en-US.json";
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export const connectionTranslator = extensionI18n.get(messages);
export function useConnectionI18n() {
  return useI18n(messages, extensionI18n);
}
