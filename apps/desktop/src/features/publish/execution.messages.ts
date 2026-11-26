import { defineI18n, type Translator } from "@tau/i18n";
import zhCN from "./locales/execution.zh-CN.json";
import zhTW from "./locales/execution.zh-TW.json";
import enUS from "./locales/execution.en-US.json";
export const executionMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type PublishExecutionTranslate = Translator<
  Parameters<typeof executionMessages.ref>[0]
>["t"];
