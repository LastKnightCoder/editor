import { defineI18n } from "@tau/i18n";
import zhCN from "./locales/tools.zh-CN.json" with { type: "json" };
import zhTW from "./locales/tools.zh-TW.json" with { type: "json" };
import enUS from "./locales/tools.en-US.json" with { type: "json" };

export const whiteboardMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type WhiteboardMessageKey = Parameters<typeof whiteboardMessages.ref>[0];
