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
import { buildCoverMap, isOriginCell, regionAt } from "./span";
import { selectCells } from "./selection";

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

/** 按阅读顺序找下一个 / 上一个非覆盖格 */
function stepCell(table: TableElement, { row, col }: CellPosition, direction: 1 | -1) {
  const map = buildCoverMap(table);
  const cols = columnCount(table);
  for (
    let index = row * cols + col + direction;
    index >= 0 && index < map.length * cols;
    index += direction
  ) {
    const [r, c] = [Math.floor(index / cols), index % cols];
    if (isOriginCell(map, r, c)) return [r, c] as const;
  }
}

/** 光标所在合并格的上 / 下边界之外的那一行；越过表格时为 undefined */
function verticalNeighbor(table: TableElement, { row, col }: CellPosition, direction: 1 | -1) {
  const region = regionAt(buildCoverMap(table), row, col);
  const target = direction === 1 ? region.rowEnd + 1 : region.rowStart - 1;
  return target >= 0 && target < table.children.length ? target : undefined;
}

const nextCell: CellAction = (editor, at, table) => {
  const next = stepCell(table, at, 1);
  if (next) return selectCell(editor, at.tablePath, next[0], next[1]);
  return appendRowAndSelect(editor, at, table, 0);
};

const prevCell: CellAction = (editor, at, table) => {
  const previous = stepCell(table, at, -1);
  if (previous) selectCell(editor, at.tablePath, previous[0], previous[1]);
  return true;
};

const nextRow: CellAction = (editor, at, table) => {
  const row = verticalNeighbor(table, at, 1);
  return row !== undefined
    ? selectCell(editor, at.tablePath, row, at.col)
    : appendRowAndSelect(editor, at, table, at.col);
};

const moveDown: CellAction = (editor, at, table) => {
  if (isMultiline(table, at)) return false;
  const row = verticalNeighbor(table, at, 1);
  if (row !== undefined) return selectCell(editor, at.tablePath, row, at.col);
  const next = Editor.next(editor, { at: at.tablePath });
  if (next) Transforms.select(editor, Editor.start(editor, next[1]));
  else insertParagraphAndFocus(editor, table);
  return true;
};

const moveUp: CellAction = (editor, at, table) => {
  if (isMultiline(table, at)) return false;
  const row = verticalNeighbor(table, at, -1);
  if (row !== undefined) return selectCell(editor, at.tablePath, row, at.col);
  const previous = Editor.previous(editor, { at: at.tablePath });
  if (!previous) return false;
  Transforms.select(editor, Editor.end(editor, previous[1]));
  return true;
};

/** 光标在合并格内时 Esc 选中整格（可接着拆分）；普通格放行给其它 Esc 处理 */
const selectMergedCell: CellAction = (editor, at, table) => {
  const region = regionAt(buildCoverMap(table), at.row, at.col);
  if (region.rowStart === region.rowEnd && region.colStart === region.colEnd) return false;
  return selectCells(editor, at.tablePath, region);
};

export const tableCommands: EditorCommand[] = [
  tableCommand("tau.table.next-cell", "下一单元格", nextCell),
  tableCommand("tau.table.prev-cell", "上一单元格", prevCell),
  tableCommand("tau.table.next-row", "下一行", nextRow),
  tableCommand("tau.table.move-down", "移到下方单元格", moveDown),
  tableCommand("tau.table.move-up", "移到上方单元格", moveUp),
  tableCommand("tau.table.select-merged-cell", "选中合并单元格", selectMergedCell),
];

export const tableHotkeys: EditorHotkey[] = [
  { key: "tab", command: "tau.table.next-cell" },
  { key: "shift+tab", command: "tau.table.prev-cell" },
  { key: "enter", command: "tau.table.next-row" },
  { key: "ArrowDown", command: "tau.table.move-down" },
  { key: "ArrowUp", command: "tau.table.move-up" },
  { key: "escape", command: "tau.table.select-merged-cell" },
];
