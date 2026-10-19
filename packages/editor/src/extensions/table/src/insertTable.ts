import { Editor, Transforms } from "slate";
import { ReactEditor } from "slate-react";
import { setOrInsertNode } from "@tau/editor/api";
import type { TableElement, TableRowElement, TableCellElement } from "./types";

export const insertTable = (editor: Editor, rows: number, cols: number) => {
  if (!editor.selection || ReactEditor.isReadOnly(editor)) return;
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) return;
  // 根据行数和列数创建一个表格
  const tableRowElements: TableRowElement[] = Array.from({ length: rows }).map(() => {
    const tableCellElements: TableCellElement[] = Array.from({
      length: cols,
    }).map(() => {
      return {
        type: "table-cell",
        children: [{ type: "formatted", text: "" }],
      };
    });
    return {
      type: "table-row",
      children: tableCellElements,
    };
  });
  const tableElement: TableElement = {
    type: "table",
    children: tableRowElements,
  };
  const insertPath = setOrInsertNode(editor, tableElement);
  if (!insertPath) return;
  const firstCellPath = [...insertPath, 0, 0];
  Transforms.select(editor, {
    anchor: Editor.start(editor, firstCellPath),
    focus: Editor.start(editor, firstCellPath),
  });

  return insertPath;
};
