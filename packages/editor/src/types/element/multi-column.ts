import { BlockElement } from "../custom-element";

export interface MultiColumnContainerElement {
  type: "multi-column-container";
  children: MultiColumnItemElement[];
}

export interface MultiColumnItemElement {
  type: "multi-column-item";
  width?: number;
  children: BlockElement[];
}
