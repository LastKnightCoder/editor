import { createEditor, type BaseSelection, type Descendant, type Editor } from "slate";

/** 构造「段落 + rows×cols 表格」文档，单元格文字为 r{行}c{列}；表格位于 [1] */
export function createTableEditor(
  rows: number,
  cols: number,
  options: { align?: Array<"left" | "center" | "right" | null>; selection?: BaseSelection } = {}
): Editor {
  const editor = createEditor();
  editor.children = [
    { type: "paragraph", children: [{ type: "formatted", text: "intro" }] },
    {
      type: "table",
      ...(options.align ? { align: options.align } : {}),
      children: Array.from({ length: rows }, (_, row) => ({
        type: "table-row",
        children: Array.from({ length: cols }, (_, col) => ({
          type: "table-cell",
          children: [{ type: "formatted", text: `r${row}c${col}` }],
        })),
      })),
    },
  ] as unknown as Descendant[];
  editor.selection = options.selection ?? null;
  return editor;
}

/** 折叠光标放在 (row, col) 单元格文字内 offset 处 */
export function caretInCell(row: number, col: number, offset = 1): BaseSelection {
  const point = { path: [1, row, col, 0], offset };
  return { anchor: point, focus: point };
}
