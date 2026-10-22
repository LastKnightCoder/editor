import {
  deleteColumns,
  deleteRows,
  getTableAt,
  insertColumns,
  insertRows,
  moveColumn,
  moveRow,
  removeTable,
  selectCell,
  setColumnAlign,
  type TableAlign,
} from "@tau/editor/extensions/table";
import type { Editor } from "slate";

import type { TableEditingContext } from "./editingContext";

/** 表格上下文配件栏与「⋯」菜单的动作 */
export type TableActionId =
  | "insert-row-below"
  | "insert-column-right"
  | "delete-row"
  | "delete-column"
  | "cycle-align"
  | "move-row-up"
  | "move-row-down"
  | "move-column-left"
  | "move-column-right"
  | "delete-table";

/** 当前列的对齐；左对齐按未指定（null）存储 */
export function getColumnAlign(editor: Editor, context: TableEditingContext): TableAlign {
  return getTableAt(editor, context.tablePath)?.align?.[context.col] ?? null;
}

/** 对齐循环：左（未指定）→ 居中 → 居右 → 左；setColumnAlign 把 left 存为 null，二者视为同一档 */
export function nextColumnAlign(current: TableAlign): TableAlign {
  if (current === "center") return "right";
  if (current === "right") return null;
  return "center";
}

/** 动作在当前上下文是否不可用：删行至少保留表头 + 一行，删列至少保留一列，移动不越界 */
export function isTableActionDisabled(id: TableActionId, context: TableEditingContext): boolean {
  switch (id) {
    case "delete-row":
      return context.rowCount <= 2;
    case "delete-column":
      return context.colCount <= 1;
    case "move-row-up":
      return context.row <= 0;
    case "move-row-down":
      return context.row >= context.rowCount - 1;
    case "move-column-left":
      return context.col <= 0;
    case "move-column-right":
      return context.col >= context.colCount - 1;
    default:
      return false;
  }
}

/** 执行表格动作并把光标放到合理位置；不可用或变换失败返回 false */
export function runTableAction(
  editor: Editor,
  id: TableActionId,
  context: TableEditingContext
): boolean {
  if (isTableActionDisabled(id, context)) return false;
  const { tablePath, row, col } = context;
  const moveCaret = (targetRow: number, targetCol: number) =>
    selectCell(editor, tablePath, targetRow, targetCol, "start");

  switch (id) {
    case "insert-row-below":
      return insertRows(editor, tablePath, row + 1) && moveCaret(row + 1, col);
    case "insert-column-right":
      return insertColumns(editor, tablePath, col + 1) && moveCaret(row, col + 1);
    case "delete-row":
      // 删行后同下标即原下一行；删的是末行时 selectCell 就近取上一行
      return deleteRows(editor, tablePath, row) && moveCaret(row, col);
    case "delete-column":
      return deleteColumns(editor, tablePath, col) && moveCaret(row, col);
    case "cycle-align":
      return setColumnAlign(
        editor,
        tablePath,
        col,
        col,
        nextColumnAlign(getColumnAlign(editor, context))
      );
    // 移动行列时选区随单元格节点移动，无需再定位
    case "move-row-up":
      return moveRow(editor, tablePath, row, row - 1);
    case "move-row-down":
      return moveRow(editor, tablePath, row, row + 1);
    case "move-column-left":
      return moveColumn(editor, tablePath, col, col - 1);
    case "move-column-right":
      return moveColumn(editor, tablePath, col, col + 1);
    case "delete-table":
      return removeTable(editor, tablePath);
  }
}
