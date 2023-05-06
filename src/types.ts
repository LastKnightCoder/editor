import {BaseEditor} from "slate";
import {ReactEditor} from "slate-react";
import {HistoryEditor} from "slate-history";
import { ParagraphElement, CodeBlockElement } from "./custom-types";

type CustomElement = ParagraphElement | CodeBlockElement;

declare module 'slate' {
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor & HistoryEditor,
    Element: CustomElement,
  }
}