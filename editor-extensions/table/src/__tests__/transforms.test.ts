import { createEditor, Editor, Element, Node, Transforms, type Descendant } from "slate";
import { describe, expect, it } from "vitest";
import { createMarkdownProcessor } from "@tau/markdown";
import { editorMarkdownCodecs } from "@tau/editor/markdown";

import { tableMarkdownCodecs } from "../../markdown";
import { tableCellNormalize, tableNormalize, tableRowNormalize } from "../normalize";
import {
  clearCells,
  deleteColumns,
  deleteRows,
  getCellPosition,
  insertColumns,
  insertRows,
  moveColumn,
  moveRow,
  setColumnAlign,
} from "../transforms";
import type { TableElement } from "../types";

const NORMALIZERS: Record<string, { normalize: (editor: Editor, entry: never) => boolean }> = {
  table: tableNormalize,
  "table-row": tableRowNormalize,
  "table-cell": tableCellNormalize,
} as never;

/** 只装表格规范化的最小编辑器（内核行为分发等价：返回 true 即不走默认） */
function setup(children: Descendant[]) {
  const editor = createEditor();
  const { normalizeNode } = editor;
  editor.normalizeNode = (entry, options) => {
    const [node] = entry;
    const rule = Element.isElement(node) ? NORMALIZERS[node.type] : undefined;
    if (rule?.normalize(editor, entry as never)) return;
    normalizeNode(entry, options);
  };
  editor.children = children;
  Editor.normalize(editor, { force: true });
  return editor;
}

const cell = (text: string) => ({ type: "table-cell", children: [{ type: "formatted", text }] });
const grid = (rows: string[][], extra: Partial<TableElement> = {}) =>
  ({
    type: "table",
    children: rows.map(row => ({ type: "table-row", children: row.map(cell) })),
    ...extra,
  }) as unknown as Descendant;
const texts = (editor: Editor, path = [0]) =>
  (Node.get(editor, path) as TableElement).children.map(row =>
    row.children.map(c => Node.string(c))
  );
const tableAt = (editor: Editor, path = [0]) => Node.get(editor, path) as TableElement;

describe("表格结构不变式", () => {
  it("行格数不一致时补齐到最大列数", () => {
    const editor = setup([grid([["a", "b", "c"], ["d"], ["e", "f"]])]);
    expect(texts(editor)).toEqual([
      ["a", "b", "c"],
      ["d", "", ""],
      ["e", "f", ""],
    ]);
  });

  it("没有行的表格变回空段落，空行补出单元格", () => {
    const editor = setup([
      { type: "table", children: [] } as unknown as Descendant,
      { type: "table", children: [{ type: "table-row", children: [] }] } as unknown as Descendant,
    ]);
    expect((editor.children[0] as Element).type).toBe("paragraph");
    expect(texts(editor, [1])).toEqual([[""]]);
  });

  it("格内块级子节点解包为行内内容，游离单元格包回行", () => {
    const editor = setup([
      {
        type: "table",
        children: [
          {
            type: "table-row",
            children: [
              {
                type: "table-cell",
                children: [{ type: "paragraph", children: [{ type: "formatted", text: "x" }] }],
              },
            ],
          },
          cell("y"),
        ],
      } as unknown as Descendant,
    ]);
    expect(texts(editor)).toEqual([["x"], ["y"]]);
    expect(tableAt(editor).children[0].children[0].children).toEqual([
      { type: "formatted", text: "x" },
    ]);
  });

  it("对齐数组长度跟随列数，全部未指定时移除", () => {
    const editor = setup([
      grid([["a", "b"]], { align: ["center"] as TableElement["align"] }),
      grid([["c"]], { align: [null] }),
    ]);
    expect(tableAt(editor).align).toEqual(["center", null]);
    expect("align" in tableAt(editor, [1])).toBe(false);
  });
});

describe("按下标的行列变换", () => {
  const base = () =>
    setup([
      grid([
        ["h1", "h2", "h3"],
        ["a1", "a2", "a3"],
        ["b1", "b2", "b3"],
      ]),
    ]);

  it("插入行列只产生插入操作，不整表替换", () => {
    const editor = base();
    editor.operations = [];
    insertRows(editor, [0], 1, 2);
    expect(texts(editor).map(row => row[0])).toEqual(["h1", "", "", "a1", "b1"]);
    expect(editor.operations.every(op => op.type === "insert_node")).toBe(true);

    setColumnAlign(editor, [0], 2, 2, "right");
    insertColumns(editor, [0], 0);
    expect(texts(editor)[0]).toEqual(["", "h1", "h2", "h3"]);
    expect(texts(editor)[4]).toEqual(["", "b1", "b2", "b3"]);
    expect(tableAt(editor).align).toEqual([null, null, null, "right"]);
  });

  it("删除行列；删除首行后下一行成为表头；删光回到段落", () => {
    const editor = base();
    deleteRows(editor, [0], 0);
    expect(texts(editor)[0]).toEqual(["a1", "a2", "a3"]);
    setColumnAlign(editor, [0], 1, 1, "center");
    deleteColumns(editor, [0], 0, 1);
    expect(texts(editor)).toEqual([["a3"], ["b3"]]);
    expect("align" in tableAt(editor)).toBe(false);
    deleteColumns(editor, [0], 0);
    expect((editor.children[0] as Element).type).toBe("paragraph");
    expect(editor.selection?.anchor.path).toEqual([0, 0]);
  });

  it("移动行列到最终下标，对齐随列移动", () => {
    const editor = base();
    moveRow(editor, [0], 0, 2);
    expect(texts(editor).map(row => row[0])).toEqual(["a1", "b1", "h1"]);
    moveRow(editor, [0], 2, 0);
    setColumnAlign(editor, [0], 0, 0, "center");
    moveColumn(editor, [0], 0, 2);
    expect(texts(editor)[0]).toEqual(["h2", "h3", "h1"]);
    expect(tableAt(editor).align).toEqual([null, null, "center"]);
  });

  it("左对齐按未指定存储；清空矩形只动内容", () => {
    const editor = base();
    setColumnAlign(editor, [0], 0, 2, "center");
    setColumnAlign(editor, [0], 0, 2, "left");
    expect("align" in tableAt(editor)).toBe(false);
    clearCells(editor, [0], { rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 2 });
    expect(texts(editor)).toEqual([
      ["h1", "h2", "h3"],
      ["a1", "", ""],
      ["b1", "", ""],
    ]);
  });

  it("越界与非表格路径不写入", () => {
    const editor = base();
    const before = JSON.stringify(editor.children);
    expect(insertRows(editor, [0], 9)).toBe(false);
    expect(moveRow(editor, [0], 0, 5)).toBe(false);
    expect(deleteRows(editor, [1], 0)).toBe(false);
    expect(JSON.stringify(editor.children)).toBe(before);
  });

  it("从选区读出单元格位置", () => {
    const editor = base();
    Transforms.select(editor, { path: [0, 2, 1, 0], offset: 1 });
    expect(getCellPosition(editor)).toEqual({ tablePath: [0], row: 2, col: 1 });
  });
});

describe("Markdown 列对齐", () => {
  const processor = createMarkdownProcessor({
    codecs: [...editorMarkdownCodecs, ...tableMarkdownCodecs],
  });

  it("导入保留 :---: 对齐，导出往返一致", () => {
    const markdown = "| 名称 | 数量 | 备注 |\n| :---: | ---: | --- |\n| a | 1 | x |";
    const value = processor.importFromMarkdown(markdown);
    const table = value.find(node => (node as Element).type === "table") as TableElement;
    expect(table.align).toEqual(["center", "right", null]);
    expect(processor.getMarkdown(value)).toContain("| :---: | ---: | --- |");
    expect(processor.importFromMarkdown(processor.getMarkdown(value))).toEqual(value);
  });

  it("未指定对齐时不写 align 字段，分隔行保持 ---", () => {
    const value = processor.importFromMarkdown("| a | b |\n| --- | --- |\n| 1 | 2 |");
    const table = value.find(node => (node as Element).type === "table") as TableElement;
    expect("align" in table).toBe(false);
    expect(processor.getMarkdown(value)).toContain("| --- | --- |");
  });
});
