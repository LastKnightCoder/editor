import { defineI18n } from "@tau/i18n";
import zhCN from "./locales/workspace.zh-CN.json";
import zhTW from "./locales/workspace.zh-TW.json";
import enUS from "./locales/workspace.en-US.json";
export const speechWorkspaceMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type SpeechWorkspaceMessageKey = Parameters<typeof speechWorkspaceMessages.ref>[0];
