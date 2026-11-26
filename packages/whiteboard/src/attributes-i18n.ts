import { defineI18n, type Translator } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { useWhiteboardI18nRuntime } from "./i18n-context";
import zhCN from "./locales/attributes.zh-CN.json";
import zhTW from "./locales/attributes.zh-TW.json";
import enUS from "./locales/attributes.en-US.json";

export const attributeMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type AttributeTranslate = Translator<Parameters<typeof attributeMessages.ref>[0]>["t"];
export function useAttributeI18n() {
  return useI18n(attributeMessages, useWhiteboardI18nRuntime());
}
