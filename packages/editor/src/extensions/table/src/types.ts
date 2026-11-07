import type { InlineElement } from "@tau/editor/api";
import type { FormattedText } from "@tau/markdown/model";
import type { TableAlign } from "./align";

export type { TableAlign };

export interface TableCellElement {
  type: "table-cell";
  /** 向下合并的行数（含自身），等于 1 时省略；只在合并区域左上格上存在 */
  rowSpan?: number;
  /** 向右合并的列数（含自身），等于 1 时省略；只在合并区域左上格上存在 */
  colSpan?: number;
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
