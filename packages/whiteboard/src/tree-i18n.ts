import { defineI18n, type Translator } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { useWhiteboardI18nRuntime } from "./i18n-context";
import zhCN from "./locales/tree.zh-CN.json";
import zhTW from "./locales/tree.zh-TW.json";
import enUS from "./locales/tree.en-US.json";

export const treeMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type TreeTranslate = Translator<Parameters<typeof treeMessages.ref>[0]>["t"];
export function useTreeI18n() {
  return useI18n(treeMessages, useWhiteboardI18nRuntime());
}
