import type { Descendant } from "slate";

export interface AbcElement {
  type: "abc";
  content: string;
  children: Descendant[];
}
