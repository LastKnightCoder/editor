import { Descendant } from "slate";

export interface TypstElement {
  type: "typst";
  content: string;
  html?: string;
  compiledFrom?: string;
  compiledAt?: number;
  children: Descendant[];
}
