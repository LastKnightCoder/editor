import { BaseEditor } from "slate";
import { ReactEditor } from "slate-react";
import { HistoryEditor } from "slate-history";
import { Editor as CodeMirrorEditor } from 'codemirror';
import {
  ParagraphElement,
  CodeBlockElement,
  FormattedText,
  CalloutElement,
  HeaderElement,
  ListItemElement,
  NumberedListElement,
  BulletedListElement,
  ImageElement,
  LinkElement,
  DetailElement,
  CodeBlock2Element,
  CodeLineElement
} from "./custom-types";

export type CustomField = {
  codeBlockMap: Map<string, CodeMirrorEditor>,
  type: string,
  escMode: boolean,
}
export type CustomElement = ParagraphElement | CodeBlockElement | CalloutElement | HeaderElement | BulletedListElement | NumberedListElement | ListItemElement | ImageElement | DetailElement | CodeBlock2Element | CodeLineElement;
export type CustomText = FormattedText | LinkElement;


declare module 'slate' {
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor & HistoryEditor & CustomField;
    Element: CustomElement,
    Text: CustomText,
  }
}