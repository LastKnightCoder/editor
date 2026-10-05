import type { InlineElement } from "@tau/editor/api";
import type { FormattedText } from "@tau/markdown/model";
import type { TableAlign } from "./align";

export type { TableAlign };

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
  /** 每列一项，长度与列数一致；全部未指定时省略 */
  align?: TableAlign[];
}

export type { ParagraphElement, IBlockPanelListItem } from "@tau/editor/api";
