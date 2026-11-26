import { defineI18n, type TranslationValues } from "@tau/i18n";
import zhCN from "./locales/tools.zh-CN.json";
import zhTW from "./locales/tools.zh-TW.json";
import enUS from "./locales/tools.en-US.json";
export const toolMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type ToolMessageKey = Parameters<typeof toolMessages.ref>[0];
export interface ToolDisplayContext {
  locale: string;
  t(key: ToolMessageKey, values?: TranslationValues): string;
}
