import { createI18nRuntime, createLocaleStore, defineI18n, type I18nRuntime } from "@tau/i18n";
import { useI18n, useI18nRuntime } from "@tau/i18n/react";
import type { Editor } from "slate";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";
export const sourceViewMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
const standalone = createI18nRuntime({ localeSource: createLocaleStore("zh-CN") });
const runtimes = new WeakMap<Editor, I18nRuntime>();
export function useSourceI18n(editor?: Editor) {
  const runtime = useI18nRuntime() ?? standalone;
  if (editor) runtimes.set(editor, runtime);
  return useI18n(sourceViewMessages, runtime);
}
export function sourceT(editor: Editor, key: Parameters<typeof sourceViewMessages.ref>[0]) {
  return (runtimes.get(editor) ?? standalone).get(sourceViewMessages).t(key);
}
