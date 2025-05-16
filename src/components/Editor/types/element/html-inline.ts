import { Descendant } from "slate";

export interface HTMLInlineElement {
  type: "html-inline";
  html: string;
  openEdit?: boolean;
  children: Descendant[];
}
