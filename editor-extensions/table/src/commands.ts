import { Editor, Node, Range, Transforms } from "slate";

import type { EditorCommand, EditorHotkey } from "@tau/editor/api";
import { insertParagraphAndFocus } from "@tau/editor/api";
import type { TableElement } from "./types";
import {
  columnCount,
  getCellPosition,
  getTableAt,
  insertRows,
  selectCell,
  type CellPosition,
} from "./transforms";

/** 单元格内的导航动作；返回 true 表示已处理（阻止默认按键行为） */
type CellAction = (editor: Editor, at: CellPosition, table: TableElement) => boolean;

/** 只在光标折叠于单元格内时生效的表格命令 */
const tableCommand = (id: string, title: string, action: CellAction): EditorCommand => ({
  id,
  title,
  run: (editor, ctx) => {
    const { selection } = editor;
    if (!selection || !Range.isCollapsed(selection)) return;
    const at = getCellPosition(editor);
    const table = at && getTableAt(editor, at.tablePath);
    if (at && table && action(editor, at, table)) ctx.event?.preventDefault();
  },
});

const appendRowAndSelect = (editor: Editor, at: CellPosition, table: TableElement, col: number) => {
  const index = table.children.length;
  insertRows(editor, at.tablePath, index);
  return selectCell(editor, at.tablePath, index, col, "start");
};

/** 格内有软换行时，上下方向键交给原生的行内移动 */
const isMultiline = (table: TableElement, { row, col }: CellPosition) =>
  Node.string(table.children[row].children[col]).includes("\n");

const nextCell: CellAction = (editor, at, table) => {
  const { tablePath, row, col } = at;
  if (col < columnCount(table) - 1) return selectCell(editor, tablePath, row, col + 1);
  if (row < table.children.length - 1) return selectCell(editor, tablePath, row + 1, 0);
  return appendRowAndSelect(editor, at, table, 0);
};

const prevCell: CellAction = (editor, { tablePath, row, col }, table) => {
  if (col > 0) return selectCell(editor, tablePath, row, col - 1);
  if (row > 0) return selectCell(editor, tablePath, row - 1, columnCount(table) - 1);
  return true;
};

const nextRow: CellAction = (editor, at, table) =>
  at.row < table.children.length - 1
    ? selectCell(editor, at.tablePath, at.row + 1, at.col)
    : appendRowAndSelect(editor, at, table, at.col);

const moveDown: CellAction = (editor, at, table) => {
  if (isMultiline(table, at)) return false;
  if (at.row < table.children.length - 1)
    return selectCell(editor, at.tablePath, at.row + 1, at.col);
  const next = Editor.next(editor, { at: at.tablePath });
  if (next) Transforms.select(editor, Editor.start(editor, next[1]));
  else insertParagraphAndFocus(editor, table);
  return true;
};

const moveUp: CellAction = (editor, at, table) => {
  if (isMultiline(table, at)) return false;
  if (at.row > 0) return selectCell(editor, at.tablePath, at.row - 1, at.col);
  const previous = Editor.previous(editor, { at: at.tablePath });
  if (!previous) return false;
  Transforms.select(editor, Editor.end(editor, previous[1]));
  return true;
};

export const tableCommands: EditorCommand[] = [
  tableCommand("tau.table.next-cell", "下一单元格", nextCell),
  tableCommand("tau.table.prev-cell", "上一单元格", prevCell),
  tableCommand("tau.table.next-row", "下一行", nextRow),
  tableCommand("tau.table.move-down", "移到下方单元格", moveDown),
  tableCommand("tau.table.move-up", "移到上方单元格", moveUp),
];

export const tableHotkeys: EditorHotkey[] = [
  { key: "tab", command: "tau.table.next-cell" },
  { key: "shift+tab", command: "tau.table.prev-cell" },
  { key: "enter", command: "tau.table.next-row" },
  { key: "ArrowDown", command: "tau.table.move-down" },
  { key: "ArrowUp", command: "tau.table.move-up" },
];
