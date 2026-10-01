import type { InlineElement } from "@tau/editor/api";
import type { FormattedText } from "@tau/markdown/model";

export interface TableCellElement {
  type: "table-cell";
  children: Array<InlineElement | FormattedText>;
}

export interface TableRowElement {
  type: "table-row";
  children: TableCellElement[];
}

export interface TableElement {
  type: "table";
  children: TableRowElement[];
}

export type { ParagraphElement, IBlockPanelListItem } from "@tau/editor/api";
