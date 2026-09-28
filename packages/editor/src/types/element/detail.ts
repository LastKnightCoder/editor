import type { BlockElement } from "../custom-element";

export interface DetailElement {
  type: "detail";
  title: string;
  open?: boolean;
  children: BlockElement[];
}
