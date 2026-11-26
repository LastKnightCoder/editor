import { defineI18n, type Translator } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { useWhiteboardI18nRuntime } from "./i18n-context";
import zhCN from "./locales/nodes.zh-CN.json";
import zhTW from "./locales/nodes.zh-TW.json";
import enUS from "./locales/nodes.en-US.json";
export const nodeMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type NodeTranslate = Translator<Parameters<typeof nodeMessages.ref>[0]>["t"];
export function useNodeI18n() {
  return useI18n(nodeMessages, useWhiteboardI18nRuntime());
}
