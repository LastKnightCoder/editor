import {BaseEditor} from "slate";
import {ReactEditor} from "slate-react";
import {HistoryEditor} from "slate-history";
import { ParagraphElement, CodeBlockElement, HighLightText, NormalText, BoldText, ItalicText, UnderlineText } from "./custom-types";

type CustomElement = ParagraphElement | CodeBlockElement;
type CustomText = NormalText | BoldText | ItalicText | UnderlineText | HighLightText;

declare module 'slate' {
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor & HistoryEditor,
    Element: CustomElement,
    Text: CustomText,
  }
}