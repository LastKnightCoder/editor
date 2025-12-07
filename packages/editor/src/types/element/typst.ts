import { Descendant } from "slate";

export interface TypstElement {
  type: "typst";
  content: string;
  html?: string;
  children: Descendant[];
}
