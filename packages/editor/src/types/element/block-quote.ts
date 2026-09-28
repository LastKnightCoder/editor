import type { BlockElement } from "../custom-element";

export interface BlockquoteElement {
  type: "blockquote";
  children: BlockElement[];
}
