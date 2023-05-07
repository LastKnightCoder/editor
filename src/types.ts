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
} from "./custom-types";

export type CustomMap = {
  codeBlockMap: Map<string, CodeMirrorEditor>,
  type: string,
}
export type CustomElement = ParagraphElement | CodeBlockElement | CalloutElement | HeaderElement | BulletedListElement | NumberedListElement | ListItemElement | ImageElement;
export type CustomText = FormattedText | LinkElement;


declare module 'slate' {
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor & HistoryEditor & CustomMap;
    Element: CustomElement,
    Text: CustomText,
  }
}