import { defineI18n, type Translator } from "@tau/i18n";
import zhCN from "./locales/forms.zh-CN.json";
import zhTW from "./locales/forms.zh-TW.json";
import enUS from "./locales/forms.en-US.json";
export const mcpFormsMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type McpFormsT = Translator<Parameters<typeof mcpFormsMessages.ref>[0]>["t"];
