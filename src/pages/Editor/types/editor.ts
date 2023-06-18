import { BaseEditor } from "slate";
import { ReactEditor } from "slate-react";
import { HistoryEditor } from "slate-history";
import { Editor as CodeMirrorEditor } from 'codemirror';
import { CustomElement, CustomText } from "./element";

export type CustomField = {
  codeBlockMap: Map<string, CodeMirrorEditor>,
  type: string,
}

type CustomEditor = BaseEditor & ReactEditor & HistoryEditor & CustomField;

declare module 'slate' {
  interface CustomTypes {
    Editor: CustomEditor;
    Element: CustomElement,
    Text: CustomText,
  }
}