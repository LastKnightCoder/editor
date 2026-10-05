import { createContext } from "react";
import type { TableElement, TableRowElement } from "../types";

/** 表格把列对齐下发给单元格；行把自身下发给单元格以求列下标 */
export const TableAlignContext = createContext<TableElement["align"]>(undefined);
export const TableRowContext = createContext<TableRowElement | null>(null);
