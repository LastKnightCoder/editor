import coreEnUS from "./locales/core.en-US.json";
import coreZhTW from "./locales/core.zh-TW.json";
import coreZhCN from "./locales/core.zh-CN.json";
import commonEnUS from "./locales/common.en-US.json";
import commonZhTW from "./locales/common.zh-TW.json";
import commonZhCN from "./locales/common.zh-CN.json";
import avEnUS from "./locales/av.en-US.json";
import avZhTW from "./locales/av.zh-TW.json";
import avZhCN from "./locales/av.zh-CN.json";
import imageEnUS from "./locales/image.en-US.json";
import imageZhTW from "./locales/image.zh-TW.json";
import imageZhCN from "./locales/image.zh-CN.json";
import codeEnUS from "./locales/code.en-US.json";
import codeZhTW from "./locales/code.zh-TW.json";
import codeZhCN from "./locales/code.zh-CN.json";
import { createI18nRuntime, createLocaleStore, defineI18n } from "@tau/i18n";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import enUS from "./locales/en-US.json";

export const editorMessages = defineI18n({
  fallbackLocale: "zh-CN",
  resources: {
    "zh-CN": { ...zhCN, ...codeZhCN, ...imageZhCN, ...avZhCN, ...commonZhCN, ...coreZhCN },
    "zh-TW": { ...zhTW, ...codeZhTW, ...imageZhTW, ...avZhTW, ...commonZhTW, ...coreZhTW },
    "en-US": { ...enUS, ...codeEnUS, ...imageEnUS, ...avEnUS, ...commonEnUS, ...coreEnUS },
  },
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

export const requestRuntimeKey = Symbol("editor-request-runtime");
export function requestRuntime(options: object | null): I18nRuntime | undefined {
  return options ? Object.getOwnPropertyDescriptor(options, requestRuntimeKey)?.value : undefined;
}
