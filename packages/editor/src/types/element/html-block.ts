import type { Descendant } from "slate";

export interface HTMLBlockElement {
  type: "html-block";
  html: string;
  children: Descendant[];
}
