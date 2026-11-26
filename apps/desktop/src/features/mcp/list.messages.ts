import { defineI18n, type Translator } from "@tau/i18n";
import zhCN from "./locales/list.zh-CN.json";
import zhTW from "./locales/list.zh-TW.json";
import enUS from "./locales/list.en-US.json";
export const mcpListMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type McpListContext = {
  locale: string;
  t: Translator<Parameters<typeof mcpListMessages.ref>[0]>["t"];
};
