import { createContext } from "react";
import type { DragHandleProps } from "@tau/editor/api";
import type { TableCellElement } from "../../types";

export const TableRowDragContext = createContext<{
  firstCell: TableCellElement | undefined;
  dragRef: DragHandleProps["dragRef"];
  canDrag: boolean;
} | null>(null);
