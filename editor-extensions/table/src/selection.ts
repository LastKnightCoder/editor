import { Editor, Node, Path, Point, Range, Text, Transforms } from "slate";
import type { Plugin } from "@tau/editor/api";

import type { TableElement } from "./types";
import {
  clearCells,
  columnCount,
  deleteColumns,
  deleteRows,
  getCellPosition,
  getTableAt,
  selectCell,
  type CellRect,
} from "./transforms";

/**
 * 格选区：Slate 选区的两端落在同一张表的不同单元格时，按矩形理解（不按文档顺序）。
 * 行 / 列手柄与格内 Esc 产生的选区另带类型标记；标记只在选区原样未变时有效，
 * 选区一动即自然失效，不需要额外的清理时机。
 */

export type CellSelectionKind = "cells" | "row" | "col";

export interface CellSelection extends CellRect {
  tablePath: Path;
  kind: CellSelectionKind;
}

const marks = new WeakMap<Editor, { range: Range; kind: CellSelectionKind }>();

export function getCellSelection(
  editor: Editor,
  selection: Range | null = editor.selection
): CellSelection | undefined {
  if (!selection) return;
  const mark = marks.get(editor);
  const markedKind = mark && Range.equals(mark.range, selection) ? mark.kind : undefined;
  if (!markedKind && Range.isCollapsed(selection)) return;
  const anchor = getCellPosition(editor, selection.anchor);
  const focus = getCellPosition(editor, selection.focus);
  if (!anchor || !focus || !Path.equals(anchor.tablePath, focus.tablePath)) return;
  if (!markedKind && anchor.row === focus.row && anchor.col === focus.col) return;
  return {
    tablePath: anchor.tablePath,
    rowStart: Math.min(anchor.row, focus.row),
    rowEnd: Math.max(anchor.row, focus.row),
    colStart: Math.min(anchor.col, focus.col),
    colEnd: Math.max(anchor.col, focus.col),
    kind: markedKind ?? "cells",
  };
}

/** 选中矩形内的单元格（左上格起点到右下格终点） */
export function selectCells(
  editor: Editor,
  tablePath: Path,
  rect: CellRect,
  kind: CellSelectionKind = "cells"
): boolean {
  if (!getTableAt(editor, tablePath)) return false;
  Transforms.select(editor, {
    anchor: Editor.start(editor, [...tablePath, rect.rowStart, rect.colStart]),
    focus: Editor.end(editor, [...tablePath, rect.rowEnd, rect.colEnd]),
  });
  if (editor.selection) marks.set(editor, { range: editor.selection, kind });
  return true;
}

export function selectRows(editor: Editor, tablePath: Path, from: number, to = from): boolean {
  const table = getTableAt(editor, tablePath);
  if (!table) return false;
  const rect = { rowStart: from, rowEnd: to, colStart: 0, colEnd: columnCount(table) - 1 };
  return selectCells(editor, tablePath, rect, "row");
}

export function selectColumns(editor: Editor, tablePath: Path, from: number, to = from): boolean {
  const table = getTableAt(editor, tablePath);
  if (!table) return false;
  const rect = { rowStart: 0, rowEnd: table.children.length - 1, colStart: from, colEnd: to };
  return selectCells(editor, tablePath, rect, "col");
}

/** 整行 / 整列选区删除行列，其余清空内容；光标落回选区左上方的格子 */
export function deleteCellSelection(editor: Editor, selection: CellSelection) {
  const { tablePath, rowStart, colStart } = selection;
  if (selection.kind === "row") {
    if (!deleteRows(editor, tablePath, rowStart, selection.rowEnd)) return;
  } else if (selection.kind === "col") {
    if (!deleteColumns(editor, tablePath, colStart, selection.colEnd)) return;
  } else {
    clearCells(editor, tablePath, selection);
  }
  // 删光时 removeTable 已把光标放进替换的段落
  if (getTableAt(editor, tablePath)) {
    selectCell(editor, tablePath, rowStart, selection.kind === "row" ? 0 : colStart, "start");
  }
}

/** 选区矩形对应的子表（复制用），保留对应列的对齐 */
export function extractSubTable(editor: Editor, selection: CellSelection): TableElement {
  const table = getTableAt(editor, selection.tablePath) as TableElement;
  const cols = (cells: readonly unknown[]) => cells.slice(selection.colStart, selection.colEnd + 1);
  const align = table.align ? (cols(table.align) as TableElement["align"]) : undefined;
  return structuredClone({
    type: "table",
    children: table.children.slice(selection.rowStart, selection.rowEnd + 1).map(row => ({
      ...row,
      children: cols(row.children) as TableElement["children"][number]["children"],
    })),
    ...(align?.some(value => value !== null) ? { align } : {}),
  });
}

const cellTexts = (table: TableElement) =>
  table.children.map(row => row.children.map(cell => Node.string(cell)));

/** 电子表格兼容的 TSV：含分隔符、换行或引号的字段加引号 */
export const toTsv = (table: TableElement) =>
  cellTexts(table)
    .map(row =>
      row.map(text => (/[\t\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text)).join("\t")
    )
    .join("\n");

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");

export const toHtmlTable = (table: TableElement, withHeader: boolean) =>
  `<table><tbody>${cellTexts(table)
    .map((row, index) => {
      const tag = withHeader && index === 0 ? "th" : "td";
      return `<tr>${row.map(text => `<${tag}>${escapeHtml(text)}</${tag}>`).join("")}</tr>`;
    })
    .join("")}</tbody></table>`;

/**
 * 受信任层插件（ER-005）：delete / deleteFragment / insertText / insertBreak / 复制
 * 是编辑器级方法，不在元素行为面上。
 */
export const withTableCellSelection: Plugin = editor => {
  const { delete: editorDelete, deleteFragment, insertText, insertBreak, insertSoftBreak } = editor;
  const { getFragment, setFragmentData, addMark, removeMark } = editor;

  const isWholeDocumentSelection = (selection: Range) => {
    const [start, end] = Range.edges(selection);
    return (
      Point.equals(start, Editor.start(editor, [])) && Point.equals(end, Editor.end(editor, []))
    );
  };

  // 全选删除：表格结构全删后补一个空段落，光标有落点
  const resetToEmptyParagraph = () => {
    Editor.withoutNormalizing(editor, () => {
      while (editor.children.length > 0) {
        Transforms.removeNodes(editor, { at: [editor.children.length - 1] });
      }
      Transforms.insertNodes(editor, {
        type: "paragraph",
        children: [{ type: "formatted", text: "" }],
      });
      Transforms.select(editor, Editor.start(editor, []));
    });
  };

  const deleteWithReset = (run: () => void) => {
    const { selection } = editor;
    const resetAfter =
      !!selection && Range.isExpanded(selection) && isWholeDocumentSelection(selection);
    run();
    if (resetAfter) resetToEmptyParagraph();
  };

  /** 格选区优先按行列 / 清空处理；指定了 at 的删除不针对选区 */
  const deleteSelection = (run: () => void, targetsSelection: boolean) => {
    const cellSelection = targetsSelection ? getCellSelection(editor) : undefined;
    if (cellSelection) deleteCellSelection(editor, cellSelection);
    else deleteWithReset(run);
  };

  editor.delete = options => deleteSelection(() => editorDelete(options), !options?.at);
  editor.deleteFragment = options => deleteSelection(() => deleteFragment(options), true);

  // 格选区上输入：清空所选格，文字落进左上格
  editor.insertText = (text, options) => {
    const cellSelection = options?.at ? undefined : getCellSelection(editor);
    if (cellSelection) {
      clearCells(editor, cellSelection.tablePath, cellSelection);
      selectCell(
        editor,
        cellSelection.tablePath,
        cellSelection.rowStart,
        cellSelection.colStart,
        "start"
      );
    }
    insertText(text, options);
  };

  editor.insertBreak = () => {
    if (getCellSelection(editor)) Transforms.collapse(editor, { edge: "focus" });
    else insertBreak();
  };

  // ⇧Enter：格内软换行（导出为 <br>），不拆单元格
  editor.insertSoftBreak = () => {
    if (getCellPosition(editor) && !getCellSelection(editor)) insertText("\n");
    else insertSoftBreak();
  };

  // 格选区的文本格式只作用于矩形内的格（Slate 选区按文档顺序会带上矩形外的格）
  const eachSelectedCell = (selection: CellSelection, run: (cellPath: Path) => void) =>
    Editor.withoutNormalizing(editor, () => {
      for (let row = selection.rowStart; row <= selection.rowEnd; row++) {
        for (let col = selection.colStart; col <= selection.colEnd; col++) {
          run([...selection.tablePath, row, col]);
        }
      }
    });

  editor.addMark = (key, value) => {
    const cellSelection = getCellSelection(editor);
    if (!cellSelection) return addMark(key, value);
    eachSelectedCell(cellSelection, at =>
      Transforms.setNodes(editor, { [key]: value }, { at, match: Text.isText })
    );
  };

  editor.removeMark = key => {
    const cellSelection = getCellSelection(editor);
    if (!cellSelection) return removeMark(key);
    eachSelectedCell(cellSelection, at =>
      Transforms.unsetNodes(editor, key, { at, match: Text.isText })
    );
  };

  editor.getFragment = () => {
    const cellSelection = getCellSelection(editor);
    return cellSelection ? [extractSubTable(editor, cellSelection)] : getFragment();
  };

  editor.setFragmentData = (data, originEvent) => {
    setFragmentData(data, originEvent);
    const cellSelection = getCellSelection(editor);
    if (!cellSelection) return;
    const table = extractSubTable(editor, cellSelection);
    data.setData("text/plain", toTsv(table));
    data.setData("text/html", toHtmlTable(table, cellSelection.rowStart === 0));
  };

  return editor;
};
