import { createEditor, Node, Transforms, type Descendant, type Editor } from "slate";
import { describe, expect, it, vi } from "vitest";

import { withNormalize } from "../../../../core/plugins/withNormalize";
import {
  getCellSelection,
  selectColumns,
  selectRows,
  toTsv,
  withTableCellSelection,
  extractSubTable,
} from "../selection";
import type { TableElement } from "../types";

const paragraph = (text: string) =>
  ({ type: "paragraph", children: [{ type: "formatted", text }] }) as unknown as Descendant;
const grid = (rows: string[][], extra: Partial<TableElement> = {}) =>
  ({
    type: "table",
    children: rows.map(row => ({
      type: "table-row",
      children: row.map(text => ({ type: "table-cell", children: [{ type: "formatted", text }] })),
    })),
    ...extra,
  }) as unknown as Descendant;

function setup(children: Descendant[], base: Editor = createEditor()) {
  const editor = withTableCellSelection(withNormalize(base));
  editor.children = children;
  return editor;
}

const texts = (editor: Editor, path = [0]) =>
  (Node.get(editor, path) as TableElement).children.map(row =>
    row.children.map(cell => Node.string(cell))
  );

const base = () =>
  setup([
    grid([
      ["h1", "h2", "h3"],
      ["a1", "a2", "a3"],
      ["b1", "b2", "b3"],
    ]),
  ]);

describe("格选区", () => {
  it("两端落在同表不同格时按矩形识别，同格内是普通文本选区", () => {
    const editor = base();
    Transforms.select(editor, {
      anchor: { path: [0, 2, 0, 0], offset: 1 },
      focus: { path: [0, 1, 1, 0], offset: 0 },
    });
    expect(getCellSelection(editor)).toEqual({
      tablePath: [0],
      rowStart: 1,
      rowEnd: 2,
      colStart: 0,
      colEnd: 1,
      kind: "cells",
    });
    Transforms.select(editor, {
      anchor: { path: [0, 1, 1, 0], offset: 0 },
      focus: { path: [0, 1, 1, 0], offset: 2 },
    });
    expect(getCellSelection(editor)).toBeUndefined();
  });

  it("删除格选区只清空内容，光标落回左上格", () => {
    const editor = base();
    Transforms.select(editor, {
      anchor: { path: [0, 1, 1, 0], offset: 1 },
      focus: { path: [0, 2, 2, 0], offset: 1 },
    });
    editor.deleteFragment();
    expect(texts(editor)).toEqual([
      ["h1", "h2", "h3"],
      ["a1", "", ""],
      ["b1", "", ""],
    ]);
    expect(editor.selection?.anchor.path.slice(0, 3)).toEqual([0, 1, 1]);
  });

  it("手柄选中的整行 / 整列删除时删掉行列；选区一变标记即失效", () => {
    const editor = base();
    selectRows(editor, [0], 1, 2);
    expect(getCellSelection(editor)?.kind).toBe("row");
    editor.deleteFragment();
    expect(texts(editor)).toEqual([["h1", "h2", "h3"]]);

    selectColumns(editor, [0], 1);
    editor.delete();
    expect(texts(editor)).toEqual([["h1", "h3"]]);

    selectColumns(editor, [0], 0);
    Transforms.select(editor, {
      anchor: { path: [0, 0, 0, 0], offset: 0 },
      focus: { path: [0, 0, 1, 0], offset: 2 },
    });
    expect(getCellSelection(editor)?.kind).toBe("cells");
  });

  it("在格选区上输入：清空所选格，文字落进左上格", () => {
    const editor = base();
    Transforms.select(editor, {
      anchor: { path: [0, 0, 1, 0], offset: 0 },
      focus: { path: [0, 1, 2, 0], offset: 2 },
    });
    editor.insertText("x");
    expect(texts(editor)).toEqual([
      ["h1", "x", ""],
      ["a1", "", ""],
      ["b1", "b2", "b3"],
    ]);
  });

  it("复制格选区得到子表与 TSV，保留对应列对齐", () => {
    const editor = setup([
      grid(
        [
          ["名称", "备注"],
          ["a", 'say "hi"\tok'],
        ],
        { align: [null, "center"] }
      ),
    ]);
    Transforms.select(editor, {
      anchor: { path: [0, 0, 1, 0], offset: 0 },
      focus: { path: [0, 1, 1, 0], offset: 1 },
    });
    const fragment = editor.getFragment() as TableElement[];
    expect(fragment).toHaveLength(1);
    expect(fragment[0].align).toEqual(["center"]);
    expect(fragment[0].children.map(row => row.children.length)).toEqual([1, 1]);
    const selection = getCellSelection(editor);
    expect(toTsv(extractSubTable(editor, selection!))).toBe('备注\n"say ""hi""\tok"');
  });

  it("格内 ⇧Enter 插入软换行，不拆单元格", () => {
    const editor = base();
    Transforms.select(editor, { path: [0, 1, 0, 0], offset: 1 });
    editor.insertSoftBreak();
    expect(texts(editor)[1][0]).toBe("a\n1");
  });
});

describe("全选删除", () => {
  it("整篇全选走 editor.delete 后至少保留一个空段落", () => {
    const editor = setup([paragraph("before"), grid([["cell"]]), paragraph("after")]);
    Transforms.select(editor, {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [2, 0], offset: 5 },
    });
    editor.delete({ at: editor.selection! });
    expect(editor.children).toEqual([paragraph("")]);
  });

  it("整篇全选到表格末格走 deleteFragment 后保留空段落", () => {
    const editor = setup([paragraph("intro"), grid([["summary"]])]);
    Transforms.select(editor, {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [1, 0, 0, 0], offset: 7 },
    });
    editor.deleteFragment();
    expect(editor.children).toEqual([paragraph("")]);
  });

  it("同一格内的选区删除放行原始 delete", () => {
    const originalDelete = vi.fn();
    const raw = createEditor();
    raw.delete = originalDelete as typeof raw.delete;
    const editor = setup([grid([["cell"]])], raw);
    Transforms.select(editor, {
      anchor: { path: [0, 0, 0, 0], offset: 1 },
      focus: { path: [0, 0, 0, 0], offset: 3 },
    });
    editor.delete({ unit: "character" });
    expect(originalDelete).toHaveBeenCalledWith({ unit: "character" });
  });
});
