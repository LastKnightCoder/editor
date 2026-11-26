import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { desktopI18n } from "@/app/i18n/runtime";
import zhCN from "./locales/workspace.zh-CN.json";
import zhTW from "./locales/workspace.zh-TW.json";
import enUS from "./locales/workspace.en-US.json";
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export function useChatWorkspaceI18n() {
  return useI18n(messages, desktopI18n);
}
