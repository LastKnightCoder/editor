import { BaseEditor } from "slate";
import { ReactEditor } from "slate-react";
import { HistoryEditor } from "slate-history";
import { CustomElement, CustomText } from "./custom-element.ts";

export type CustomField = {
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