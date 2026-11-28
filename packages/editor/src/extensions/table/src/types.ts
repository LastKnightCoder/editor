import type { InlineElement } from "@tau/editor/api";
import type { FormattedText } from "@tau/markdown/model";
import type { HighlightColor } from "@tau/editor/extensions/text-formatting/palette";
import type { TableAlign } from "./align";

export type { TableAlign };

/** 行底色取行内着色色板的色相 id */
export type TableRowColor = HighlightColor;

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
  /** 整行底色；无色时省略 */
  color?: TableRowColor;
  children: TableCellElement[];
}

export interface TableElement {
  type: "table";
  children: TableRowElement[];
  /** 每列一项，长度与列数一致；全部未指定时省略 */
  align?: TableAlign[];
}

export type { ParagraphElement, IBlockPanelListItem } from "@tau/editor/api";
