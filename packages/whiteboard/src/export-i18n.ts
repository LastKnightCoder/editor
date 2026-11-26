import { defineI18n, type Translator } from "@tau/i18n";
import { useI18n } from "@tau/i18n/react";
import { useWhiteboardI18nRuntime } from "./i18n-context";
import zhCN from "./locales/export.zh-CN.json";
import zhTW from "./locales/export.zh-TW.json";
import enUS from "./locales/export.en-US.json";
export const imageExportMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type ImageExportTranslate = Translator<Parameters<typeof imageExportMessages.ref>[0]>["t"];
export function useImageExportI18n() {
  return useI18n(imageExportMessages, useWhiteboardI18nRuntime());
}
