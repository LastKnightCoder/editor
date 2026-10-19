import { Editor, Element as SlateElement, Node, Transforms, type Location, type Path } from "slate";
import { ReactEditor } from "slate-react";
import { createParagraph } from "@tau/editor/api";

import type { TableAlign, TableCellElement, TableElement, TableRowElement } from "./types";

/**
 * 表格的结构变换：全部按「表格路径 + 行列下标」寻址，不依赖光标，
 * 只用 insert/remove/move/setNodes，一次调用即一步撤销、协同只冲突在改动的行列上。
 * 只读编辑器下一律不写入，返回 false。
 */

export const createTableCell = (): TableCellElement => ({
  type: "table-cell",
  children: [{ type: "formatted", text: "" }],
});

export const createTableRow = (cols: number): TableRowElement => ({
  type: "table-row",
  children: Array.from({ length: cols }, createTableCell),
});

export const isTableElement = (node: Node): node is TableElement =>
  SlateElement.isElement(node) && node.type === "table";

export const isTableCellElement = (node: Node): node is TableCellElement =>
  SlateElement.isElement(node) && node.type === "table-cell";

export const columnCount = (table: TableElement) => table.children[0]?.children.length ?? 0;

export interface CellPosition {
  tablePath: Path;
  row: number;
  col: number;
}

/** at（默认当前选区）所在单元格的位置；不在表格内返回 undefined */
export function getCellPosition(editor: Editor, at?: Location): CellPosition | undefined {
  const location = at ?? editor.selection;
  if (!location) return;
  const cell = Editor.above(editor, { at: location, match: isTableCellElement });
  if (!cell) return;
  const [, cellPath] = cell;
  const tablePath = cellPath.slice(0, -2);
  if (!tablePath.length || !isTableElement(Node.get(editor, tablePath))) return;
  return { tablePath, row: cellPath[cellPath.length - 2], col: cellPath[cellPath.length - 1] };
}

export function getTableAt(editor: Editor, tablePath: Path): TableElement | undefined {
  if (!Node.has(editor, tablePath)) return;
  const node = Node.get(editor, tablePath);
  return isTableElement(node) ? node : undefined;
}

/** 返回可写的表格；只读或路径失效时为 undefined */
const writableTable = (editor: Editor, tablePath: Path) =>
  ReactEditor.isReadOnly(editor) ? undefined : getTableAt(editor, tablePath);

const writeAlign = (editor: Editor, tablePath: Path, align: TableAlign[]) => {
  if (align.some(value => value !== null)) {
    Transforms.setNodes<TableElement>(editor, { align }, { at: tablePath });
  } else {
    Transforms.unsetNodes(editor, "align", { at: tablePath });
  }
};

const clampRange = (from: number, to: number, length: number): [number, number] => [
  Math.max(0, Math.min(from, to)),
  Math.min(length - 1, Math.max(from, to)),
];

/** 整张表替换为空段落并把光标放进去 */
export function removeTable(editor: Editor, tablePath: Path): boolean {
  if (!writableTable(editor, tablePath)) return false;
  Editor.withoutNormalizing(editor, () => {
    Transforms.removeNodes(editor, { at: tablePath });
    Transforms.insertNodes(editor, createParagraph(), { at: tablePath });
  });
  Transforms.select(editor, Editor.start(editor, tablePath));
  return true;
}

export function insertRows(editor: Editor, tablePath: Path, index: number, count = 1): boolean {
  const table = writableTable(editor, tablePath);
  if (!table || count < 1 || index < 0 || index > table.children.length) return false;
  const rows = Array.from({ length: count }, () => createTableRow(columnCount(table)));
  Transforms.insertNodes(editor, rows, { at: [...tablePath, index] });
  return true;
}

export function insertColumns(editor: Editor, tablePath: Path, index: number, count = 1): boolean {
  const table = writableTable(editor, tablePath);
  const cols = table ? columnCount(table) : 0;
  if (!table || count < 1 || index < 0 || index > cols) return false;
  Editor.withoutNormalizing(editor, () => {
    table.children.forEach((_, row) => {
      const cells = Array.from({ length: count }, createTableCell);
      Transforms.insertNodes(editor, cells, { at: [...tablePath, row, index] });
    });
    if (table.align) {
      const align = [...table.align];
      align.splice(index, 0, ...Array<TableAlign>(count).fill(null));
      writeAlign(editor, tablePath, align);
    }
  });
  return true;
}

/** 删除 [from, to] 行；删光则整表回到空段落。删除首行时下一行自然成为表头。 */
export function deleteRows(editor: Editor, tablePath: Path, from: number, to = from): boolean {
  const table = writableTable(editor, tablePath);
  if (!table) return false;
  const [start, end] = clampRange(from, to, table.children.length);
  if (start > end) return false;
  if (start === 0 && end === table.children.length - 1) return removeTable(editor, tablePath);
  Editor.withoutNormalizing(editor, () => {
    for (let row = end; row >= start; row--) {
      Transforms.removeNodes(editor, { at: [...tablePath, row] });
    }
  });
  return true;
}

/** 删除 [from, to] 列；删光则整表回到空段落 */
export function deleteColumns(editor: Editor, tablePath: Path, from: number, to = from): boolean {
  const table = writableTable(editor, tablePath);
  if (!table) return false;
  const cols = columnCount(table);
  const [start, end] = clampRange(from, to, cols);
  if (start > end) return false;
  if (start === 0 && end === cols - 1) return removeTable(editor, tablePath);
  Editor.withoutNormalizing(editor, () => {
    table.children.forEach((_, row) => {
      for (let col = end; col >= start; col--) {
        Transforms.removeNodes(editor, { at: [...tablePath, row, col] });
      }
    });
    if (table.align) {
      const align = [...table.align];
      align.splice(start, end - start + 1);
      writeAlign(editor, tablePath, align);
    }
  });
  return true;
}

/** 把第 from 行移动到最终下标 to */
export function moveRow(editor: Editor, tablePath: Path, from: number, to: number): boolean {
  const table = writableTable(editor, tablePath);
  const rows = table?.children.length ?? 0;
  if (!table || from === to || from < 0 || to < 0 || from >= rows || to >= rows) return false;
  Transforms.moveNodes(editor, { at: [...tablePath, from], to: [...tablePath, to] });
  return true;
}

/** 把第 from 列移动到最终下标 to（对齐跟随列移动） */
export function moveColumn(editor: Editor, tablePath: Path, from: number, to: number): boolean {
  const table = writableTable(editor, tablePath);
  const cols = table ? columnCount(table) : 0;
  if (!table || from === to || from < 0 || to < 0 || from >= cols || to >= cols) return false;
  Editor.withoutNormalizing(editor, () => {
    table.children.forEach((_, row) => {
      Transforms.moveNodes(editor, { at: [...tablePath, row, from], to: [...tablePath, row, to] });
    });
    if (table.align) {
      const align = [...table.align];
      const [moved] = align.splice(from, 1);
      align.splice(to, 0, moved);
      writeAlign(editor, tablePath, align);
    }
  });
  return true;
}

/** 设置 [from, to] 列的对齐；左对齐按「未指定」存储，导出 Markdown 不产生多余的 `:---` */
export function setColumnAlign(
  editor: Editor,
  tablePath: Path,
  from: number,
  to: number,
  align: TableAlign
): boolean {
  const table = writableTable(editor, tablePath);
  if (!table) return false;
  const cols = columnCount(table);
  const [start, end] = clampRange(from, to, cols);
  if (start > end) return false;
  const next = table.align ? [...table.align] : Array<TableAlign>(cols).fill(null);
  for (let col = start; col <= end; col++) next[col] = align === "left" ? null : align;
  writeAlign(editor, tablePath, next);
  return true;
}

export interface CellRect {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
}

/** 清空矩形内单元格的内容，结构不变 */
export function clearCells(editor: Editor, tablePath: Path, rect: CellRect): boolean {
  const table = writableTable(editor, tablePath);
  if (!table) return false;
  Editor.withoutNormalizing(editor, () => {
    for (let row = rect.rowStart; row <= rect.rowEnd; row++) {
      for (let col = rect.colStart; col <= rect.colEnd; col++) {
        const cell = table.children[row]?.children[col];
        if (!cell) continue;
        const cellPath = [...tablePath, row, col];
        for (let i = cell.children.length - 1; i >= 0; i--) {
          Transforms.removeNodes(editor, { at: [...cellPath, i] });
        }
        Transforms.insertNodes(editor, { type: "formatted", text: "" }, { at: [...cellPath, 0] });
      }
    }
  });
  return true;
}

export type CellContent = TableCellElement["children"];

/**
 * 从 (row, col) 起按格写入内容，行列不够时在末尾补齐；空内容写成空文本。
 * 一次调用即一步撤销。
 */
export function fillCells(
  editor: Editor,
  tablePath: Path,
  row: number,
  col: number,
  grid: CellContent[][]
): boolean {
  const table = writableTable(editor, tablePath);
  const width = Math.max(0, ...grid.map(cells => cells.length));
  if (!table || !grid.length || !width) return false;
  Editor.withoutNormalizing(editor, () => {
    const missingRows = row + grid.length - table.children.length;
    if (missingRows > 0) insertRows(editor, tablePath, table.children.length, missingRows);
    const missingCols = col + width - columnCount(table);
    if (missingCols > 0) insertColumns(editor, tablePath, columnCount(table), missingCols);
    grid.forEach((cells, i) =>
      cells.forEach((content, j) => {
        const cellPath = [...tablePath, row + i, col + j];
        const cell = Node.get(editor, cellPath) as TableCellElement;
        for (let k = cell.children.length - 1; k >= 0; k--) {
          Transforms.removeNodes(editor, { at: [...cellPath, k] });
        }
        const nodes = content.length ? structuredClone(content) : [{ type: "formatted", text: "" }];
        Transforms.insertNodes(editor, nodes as CellContent, { at: [...cellPath, 0] });
      })
    );
  });
  return true;
}

/** 光标放进指定单元格（默认末尾）；越界时就近取格 */
export function selectCell(
  editor: Editor,
  tablePath: Path,
  row: number,
  col: number,
  edge: "start" | "end" = "end"
): boolean {
  const table = getTableAt(editor, tablePath);
  if (!table || !table.children.length) return false;
  const safeRow = Math.max(0, Math.min(row, table.children.length - 1));
  const safeCol = Math.max(0, Math.min(col, table.children[safeRow].children.length - 1));
  const cellPath = [...tablePath, safeRow, safeCol];
  Transforms.select(
    editor,
    edge === "end" ? Editor.end(editor, cellPath) : Editor.start(editor, cellPath)
  );
  return true;
}
