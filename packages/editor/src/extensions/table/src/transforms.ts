import { Editor, Element as SlateElement, Node, Transforms, type Location, type Path } from "slate";
import { ReactEditor } from "slate-react";
import { createParagraph } from "@tau/editor/api";

import type { TableAlign, TableCellElement, TableElement, TableRowElement } from "./types";
import {
  buildCoverMap,
  cellSpan,
  expandToRegions,
  originsIn,
  originsIntersecting,
  regionAt,
  regionOfOrigin,
  regionsCrossing,
  type CellRect,
  type CoverMap,
} from "./span";

export type { CellRect } from "./span";

/**
 * 表格的结构变换：全部按「表格路径 + 行列下标」寻址，不依赖光标，
 * 只用 insert/remove/move/setNodes，一次调用即一步撤销、协同只冲突在改动的行列上。
 * 只读编辑器下一律不写入，返回 false。
 * 合并单元格：表格仍是满格矩形，下标即坐标；行列变换只额外调整跨度，见 span.ts。
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

export type CellSpanProps = Pick<TableCellElement, "rowSpan" | "colSpan">;

type Axis = "row" | "col";

const spanKey = (axis: Axis) => (axis === "row" ? "rowSpan" : "colSpan");

const isBlankContent = (content: CellContent) =>
  content.length === 0 || (content.length === 1 && "text" in content[0] && content[0].text === "");

/** 写入跨度；等于 1 时 unset，保持「1 省略」 */
const writeSpan = (editor: Editor, at: Path, rowSpan: number, colSpan: number) => {
  const unset = [rowSpan <= 1 && "rowSpan", colSpan <= 1 && "colSpan"].filter(Boolean) as Array<
    "rowSpan" | "colSpan"
  >;
  if (unset.length) Transforms.unsetNodes(editor, unset, { at });
  const set: CellSpanProps = {
    ...(rowSpan > 1 ? { rowSpan } : {}),
    ...(colSpan > 1 ? { colSpan } : {}),
  };
  if (Object.keys(set).length) Transforms.setNodes<TableCellElement>(editor, set, { at });
};

/** 整格内容替换；空内容写成空文本 */
function replaceCellContent(
  editor: Editor,
  cellPath: Path,
  cell: TableCellElement,
  content: CellContent
) {
  for (let i = cell.children.length - 1; i >= 0; i--) {
    Transforms.removeNodes(editor, { at: [...cellPath, i] });
  }
  const nodes = content.length ? structuredClone(content) : [{ type: "formatted", text: "" }];
  Transforms.insertNodes(editor, nodes as CellContent, { at: [...cellPath, 0] });
}

/** 插入位置落在合并区域内部时区域跨度 +count（新格成为被覆盖格） */
function growSpans(
  editor: Editor,
  tablePath: Path,
  map: CoverMap,
  axis: Axis,
  index: number,
  count: number
) {
  for (const region of regionsCrossing(map, axis, index)) {
    const span =
      axis === "row" ? region.rowEnd - region.rowStart + 1 : region.colEnd - region.colStart + 1;
    Transforms.setNodes<TableCellElement>(
      editor,
      { [spanKey(axis)]: span + count },
      { at: [...tablePath, region.rowStart, region.colStart] }
    );
  }
}

/**
 * 删除 [start, end] 行 / 列前收缩跨过它们的区域；原点所在行 / 列被删时，
 * 内容与剩余跨度移到区域剩下的第一行 / 列。区域整个被删时不处理。
 */
function shrinkSpans(
  editor: Editor,
  tablePath: Path,
  table: TableElement,
  axis: Axis,
  start: number,
  end: number
) {
  const map = buildCoverMap(table);
  for (const [r, c] of originsIn(map, fullRect(table))) {
    const region = regionOfOrigin(map, r, c);
    const [from, to] =
      axis === "row" ? [region.rowStart, region.rowEnd] : [region.colStart, region.colEnd];
    const overlap = Math.min(to, end) - Math.max(from, start) + 1;
    if (overlap <= 0 || overlap === to - from + 1) continue;
    const rowSpan = region.rowEnd - region.rowStart + 1 - (axis === "row" ? overlap : 0);
    const colSpan = region.colEnd - region.colStart + 1 - (axis === "col" ? overlap : 0);
    if (from < start) {
      writeSpan(editor, [...tablePath, r, c], rowSpan, colSpan);
      continue;
    }
    const [targetRow, targetCol] = axis === "row" ? [end + 1, c] : [r, end + 1];
    const targetPath = [...tablePath, targetRow, targetCol];
    const origin = table.children[r].children[c];
    replaceCellContent(
      editor,
      targetPath,
      table.children[targetRow].children[targetCol],
      origin.children
    );
    writeSpan(editor, targetPath, rowSpan, colSpan);
  }
}

const fullRect = (table: TableElement): CellRect => ({
  rowStart: 0,
  rowEnd: table.children.length - 1,
  colStart: 0,
  colEnd: columnCount(table) - 1,
});

/** 拆开与矩形相交的全部合并区域 */
function unsetSpans(editor: Editor, tablePath: Path, table: TableElement, rect: CellRect): boolean {
  const map = buildCoverMap(table);
  let changed = false;
  for (const [r, c] of originsIntersecting(map, rect)) {
    const cell = table.children[r].children[c];
    if (cell.rowSpan === undefined && cell.colSpan === undefined) continue;
    Transforms.unsetNodes(editor, ["rowSpan", "colSpan"], { at: [...tablePath, r, c] });
    changed = true;
  }
  return changed;
}

/**
 * 把第 from 行 / 列移到最终下标 to 是否会切开合并区域：被移动的行列属于跨度 ≥ 2 的区域，
 * 或放置边界落在区域内部。
 */
export function moveSplitsMerge(table: TableElement, axis: Axis, from: number, to: number) {
  const map = buildCoverMap(table);
  const lineCount = axis === "row" ? table.children.length : columnCount(table);
  for (let i = 0; i < (axis === "row" ? columnCount(table) : table.children.length); i++) {
    const region = axis === "row" ? regionAt(map, from, i) : regionAt(map, i, from);
    const span =
      axis === "row" ? region.rowEnd - region.rowStart + 1 : region.colEnd - region.colStart + 1;
    if (span > 1) return true;
  }
  const boundary = to > from ? to + 1 : to;
  return boundary < lineCount && regionsCrossing(map, axis, boundary).length > 0;
}

/** 与矩形相交的合并格数量 */
export function mergedCellCount(table: TableElement, rect: CellRect): number {
  const map = buildCoverMap(table);
  return originsIntersecting(map, rect).filter(([r, c]) =>
    cellSpan(table.children[r].children[c]).some(span => span > 1)
  ).length;
}

/**
 * 合并矩形（先扩到包住碰到的区域）：非空格内容按阅读顺序拼进左上格，以软换行分隔，
 * 其余格清空。1×1 时不合并。
 */
export function mergeCells(editor: Editor, tablePath: Path, rect: CellRect): boolean {
  const table = writableTable(editor, tablePath);
  if (!table) return false;
  const map = buildCoverMap(table);
  const target = expandToRegions(map, rect);
  if (target.rowStart === target.rowEnd && target.colStart === target.colEnd) return false;
  const origins = originsIn(map, target);
  const contents = origins
    .map(([r, c]) => table.children[r].children[c].children)
    .filter(content => !isBlankContent(content));
  const merged = contents.flatMap((content, i) =>
    i === 0 ? content : [{ type: "formatted", text: "\n" } as CellContent[number], ...content]
  );
  Editor.withoutNormalizing(editor, () => {
    for (const [r, c] of origins) {
      const at = [...tablePath, r, c];
      const cell = table.children[r].children[c];
      const isTopLeft = r === target.rowStart && c === target.colStart;
      replaceCellContent(editor, at, cell, isTopLeft ? merged : []);
      if (!isTopLeft && (cell.rowSpan !== undefined || cell.colSpan !== undefined)) {
        Transforms.unsetNodes(editor, ["rowSpan", "colSpan"], { at });
      }
    }
    writeSpan(
      editor,
      [...tablePath, target.rowStart, target.colStart],
      target.rowEnd - target.rowStart + 1,
      target.colEnd - target.colStart + 1
    );
  });
  return true;
}

/** 拆开与矩形相交的合并格，内容留在左上格 */
export function splitCells(editor: Editor, tablePath: Path, rect: CellRect): boolean {
  const table = writableTable(editor, tablePath);
  return !!table && unsetSpans(editor, tablePath, table, rect);
}

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
  Editor.withoutNormalizing(editor, () => {
    growSpans(editor, tablePath, buildCoverMap(table), "row", index, count);
    Transforms.insertNodes(editor, rows, { at: [...tablePath, index] });
  });
  return true;
}

export function insertColumns(editor: Editor, tablePath: Path, index: number, count = 1): boolean {
  const table = writableTable(editor, tablePath);
  const cols = table ? columnCount(table) : 0;
  if (!table || count < 1 || index < 0 || index > cols) return false;
  Editor.withoutNormalizing(editor, () => {
    growSpans(editor, tablePath, buildCoverMap(table), "col", index, count);
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
    shrinkSpans(editor, tablePath, table, "row", start, end);
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
    shrinkSpans(editor, tablePath, table, "col", start, end);
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
  if (moveSplitsMerge(table, "row", from, to)) return false;
  Transforms.moveNodes(editor, { at: [...tablePath, from], to: [...tablePath, to] });
  return true;
}

/** 把第 from 列移动到最终下标 to（对齐跟随列移动） */
export function moveColumn(editor: Editor, tablePath: Path, from: number, to: number): boolean {
  const table = writableTable(editor, tablePath);
  const cols = table ? columnCount(table) : 0;
  if (!table || from === to || from < 0 || to < 0 || from >= cols || to >= cols) return false;
  if (moveSplitsMerge(table, "col", from, to)) return false;
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

/** 清空矩形内单元格的内容，结构不变 */
export function clearCells(editor: Editor, tablePath: Path, rect: CellRect): boolean {
  const table = writableTable(editor, tablePath);
  if (!table) return false;
  Editor.withoutNormalizing(editor, () => {
    for (let row = rect.rowStart; row <= rect.rowEnd; row++) {
      for (let col = rect.colStart; col <= rect.colEnd; col++) {
        const cell = table.children[row]?.children[col];
        if (cell) replaceCellContent(editor, [...tablePath, row, col], cell, []);
      }
    }
  });
  return true;
}

export type CellContent = TableCellElement["children"];

/**
 * 从 (row, col) 起按格写入内容，行列不够时在末尾补齐；空内容写成空文本。
 * 目标区域内原有的合并先拆开；spans 给出时按格写入新的跨度。一次调用即一步撤销。
 */
export function fillCells(
  editor: Editor,
  tablePath: Path,
  row: number,
  col: number,
  grid: CellContent[][],
  spans?: Array<Array<CellSpanProps | undefined>>
): boolean {
  const table = writableTable(editor, tablePath);
  const width = Math.max(0, ...grid.map(cells => cells.length));
  if (!table || !grid.length || !width) return false;
  Editor.withoutNormalizing(editor, () => {
    const missingRows = row + grid.length - table.children.length;
    if (missingRows > 0) insertRows(editor, tablePath, table.children.length, missingRows);
    const missingCols = col + width - columnCount(table);
    if (missingCols > 0) insertColumns(editor, tablePath, columnCount(table), missingCols);
    const current = Node.get(editor, tablePath) as TableElement;
    unsetSpans(editor, tablePath, current, {
      rowStart: row,
      rowEnd: row + grid.length - 1,
      colStart: col,
      colEnd: col + width - 1,
    });
    grid.forEach((cells, i) =>
      cells.forEach((content, j) => {
        const cellPath = [...tablePath, row + i, col + j];
        const cell = Node.get(editor, cellPath) as TableCellElement;
        replaceCellContent(editor, cellPath, cell, content);
        const span = spans?.[i]?.[j];
        if (span) Transforms.setNodes<TableCellElement>(editor, span, { at: cellPath });
      })
    );
  });
  return true;
}

/** 光标放进指定单元格（默认末尾）；越界时就近取格，被覆盖格改为所在合并格 */
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
  const [originRow, originCol] = buildCoverMap(table)[safeRow][safeCol];
  const cellPath = [...tablePath, originRow, originCol];
  Transforms.select(
    editor,
    edge === "end" ? Editor.end(editor, cellPath) : Editor.start(editor, cellPath)
  );
  return true;
}
