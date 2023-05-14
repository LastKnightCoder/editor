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
  BlockquoteElement
} from "./custom-types";

export type CustomField = {
  codeBlockMap: Map<string, CodeMirrorEditor>,
  type: string,
  escMode: boolean,
}

export type CustomElement = ParagraphElement | CodeBlockElement | CalloutElement | HeaderElement | BulletedListElement | NumberedListElement | ListItemElement | ImageElement | DetailElement | BlockquoteElement | LinkElement;
export type CustomText = FormattedText;

declare module 'slate' {
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor & HistoryEditor & CustomField;
    Element: CustomElement,
    Text: CustomText,
  }
}