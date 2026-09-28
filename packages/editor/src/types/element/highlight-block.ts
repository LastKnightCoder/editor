import type { BlockElement } from "../custom-element";

export type Color = "red" | "green" | "yellow" | "blue" | "orange" | "purple";

export interface HighlightBlockElement {
  type: "highlight-block";
  children: BlockElement[];
  color: Color;
}
