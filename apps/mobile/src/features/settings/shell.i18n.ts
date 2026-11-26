import { defineI18n } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { mobileI18n } from "../../services/i18n";
import zhCN from "./locales/shell.zh-CN.json";
import zhTW from "./locales/shell.zh-TW.json";
import enUS from "./locales/shell.en-US.json";
const messages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type SettingsShellKey = Parameters<typeof messages.ref>[0];
export const settingsShellTranslator = mobileI18n.get(messages);
export function useSettingsShellI18n() {
  return useI18n(messages, mobileI18n);
}
