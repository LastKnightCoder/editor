import { createI18nRuntime, createLocaleStore, defineI18n } from "@tau/i18n";
import { useI18n, useI18nRuntime } from "@tau/i18n/react";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";

export const editorMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type EditorMessageKey = Parameters<typeof editorMessages.ref>[0];
const standalone = createI18nRuntime({ localeSource: createLocaleStore("zh-CN") });
export function useEditorI18n() {
  return useI18n(editorMessages, useI18nRuntime() ?? standalone);
}
export function EditorText({ message }: { message: EditorMessageKey }) {
  return useEditorI18n().t(message);
}
