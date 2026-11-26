import { useI18n, useI18nRuntime } from "@tau/i18n/react";
import { editorMessages, standaloneEditorI18n, type EditorMessageKey } from "./i18n-runtime";
export type { EditorMessageKey } from "./i18n-runtime";

export function useEditorI18nRuntime() {
  return useI18nRuntime() ?? standaloneEditorI18n;
}
export function useEditorI18n() {
  return useI18n(editorMessages, useEditorI18nRuntime());
}
export function EditorText({ message }: { message: EditorMessageKey }) {
  return useEditorI18n().t(message);
}
