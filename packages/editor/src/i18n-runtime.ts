import { createI18nRuntime, createLocaleStore, defineI18n } from "@tau/i18n";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";

export const editorMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: { "zh-CN": zhCN, "zh-TW": zhTW, "en-US": enUS },
});
export type EditorMessageKey = Parameters<typeof editorMessages.ref>[0];
export const standaloneEditorI18n = createI18nRuntime({ localeSource: createLocaleStore("zh-CN") });

import type { Editor } from "slate";
import type { I18nRuntime, TranslationValues } from "@tau/i18n";
const editorRuntimes = new WeakMap<Editor, I18nRuntime>();
export function bindEditorI18n(editor: Editor, runtime: I18nRuntime) {
  editorRuntimes.set(editor, runtime);
}
export function editorRuntime(editor?: Editor): I18nRuntime {
  return (editor && editorRuntimes.get(editor)) || standaloneEditorI18n;
}
export function editorT(
  editor: Editor | undefined,
  key: EditorMessageKey,
  values?: TranslationValues
) {
  return editorRuntime(editor).get(editorMessages).t(key, values);
}
export function editorAliases(key: EditorMessageKey): string[] {
  return Object.values(editorMessages.resources)
    .map(resource => resource[key])
    .filter(Boolean);
}
