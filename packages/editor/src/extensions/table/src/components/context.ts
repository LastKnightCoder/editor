import { createContext } from "react";
import type { TableElement, TableRowElement } from "../types";
import type { CoverMap } from "../span";

/** 表格把列对齐下发给单元格；行把自身下发给单元格以求列下标 */
export const TableAlignContext = createContext<TableElement["align"]>(undefined);
export const TableRowContext = createContext<TableRowElement | null>(null);

/** 表格的合并覆盖图与行列数；单元格据此判断是否被覆盖、是否贴右 / 下边缘 */
export interface TableCoverInfo {
  map: CoverMap;
  rows: number;
  cols: number;
  /** 行元素 → 行下标 */
  rowIndex: Map<TableRowElement, number>;
}
export const TableCoverContext = createContext<TableCoverInfo | null>(null);
