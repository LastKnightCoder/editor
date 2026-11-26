import { defineI18n } from "@tau/i18n";
import zhCN from "./locales/tts-workspace.zh-CN.json";
import zhTW from "./locales/tts-workspace.zh-TW.json";
import enUS from "./locales/tts-workspace.en-US.json";
export const ttsWorkspaceMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
