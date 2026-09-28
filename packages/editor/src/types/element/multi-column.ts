import type { BlockElement } from "../custom-element";

export interface MultiColumnContainerElement {
  type: "multi-column-container";
  columnWidths?: number[]; // 百分比数组，如 [50, 50] 或 [33.33, 33.33, 33.33]
  children: MultiColumnItemElement[];
}

export interface MultiColumnItemElement {
  type: "multi-column-item";
  width?: number;
  children: BlockElement[];
}
