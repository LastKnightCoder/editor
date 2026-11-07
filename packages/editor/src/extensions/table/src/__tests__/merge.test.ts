import { createEditor, Editor, Element, Node, type Descendant } from "slate";
import { describe, expect, it } from "vitest";

import { tableCellNormalize, tableNormalize, tableRowNormalize } from "../normalize";
import {
  getCellSelection,
  selectCells,
  selectColumns,
  selectRows,
  toHtmlTable,
  withTableCellSelection,
} from "../selection";
import { parseHtmlTableGrid } from "../paste";
import {
  deleteColumns,
  deleteRows,
  fillCells,
  insertColumns,
  insertRows,
  mergeCells,
  mergedCellCount,
  moveRow,
  splitCells,
} from "../transforms";
import type { TableCellElement, TableElement } from "../types";

const NORMALIZERS: Record<string, { normalize: (editor: Editor, entry: never) => boolean }> = {
  table: tableNormalize,
  "table-row": tableRowNormalize,
  "table-cell": tableCellNormalize,
} as never;

function setup(children: Descendant[]) {
  const editor = withTableCellSelection(createEditor());
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

type Spec = string | { text: string; rowSpan?: number; colSpan?: number };
const cell = (spec: Spec) => {
  const { text, ...span } = typeof spec === "string" ? { text: spec } : spec;
  return { type: "table-cell", ...span, children: [{ type: "formatted", text }] };
};
const grid = (rows: Spec[][]) =>
  ({
    type: "table",
    children: rows.map(row => ({ type: "table-row", children: row.map(cell) })),
  }) as unknown as Descendant;
const tableAt = (editor: Editor) => Node.get(editor, [0]) as TableElement;
const texts = (editor: Editor) =>
  tableAt(editor).children.map(row => row.children.map(c => Node.string(c)));
/** 每格的 [rowSpan, colSpan]，未设置记为 0 */
const spans = (editor: Editor) =>
  tableAt(editor).children.map(row =>
    row.children.map((c: TableCellElement) => `${c.rowSpan ?? 0}${c.colSpan ?? 0}`)
  );

const rect = (rowStart: number, colStart: number, rowEnd: number, colEnd: number) => ({
  rowStart,
  rowEnd,
  colStart,
  colEnd,
});

describe("合并与拆分", () => {
  it("合并：非空内容按阅读顺序以软换行拼进左上格，其余格清空", () => {
    const editor = setup([
      grid([
        ["a", "b", "c"],
        ["d", "", "f"],
      ]),
    ]);
    expect(mergeCells(editor, [0], rect(0, 0, 1, 1))).toBe(true);
    expect(texts(editor)).toEqual([
      ["a\nb\nd", "", "c"],
      ["", "", "f"],
    ]);
    expect(spans(editor)[0][0]).toBe("22");
  });

  it("合并前矩形扩到包住碰到的区域；1×1 不合并", () => {
    const editor = setup([
      grid([
        [{ text: "a", colSpan: 2 }, "", "c"],
        ["d", "e", "f"],
      ]),
    ]);
    expect(mergeCells(editor, [0], rect(0, 2, 0, 2))).toBe(false);
    mergeCells(editor, [0], rect(0, 1, 1, 1));
    expect(spans(editor)[0][0]).toBe("22");
    expect(texts(editor)[0][0]).toBe("a\nd\ne");
  });

  it("拆分：内容留在左上格", () => {
    const editor = setup([
      grid([
        [{ text: "a", rowSpan: 2, colSpan: 2 }, ""],
        ["", ""],
      ]),
    ]);
    splitCells(editor, [0], rect(1, 1, 1, 1));
    expect(spans(editor)).toEqual([
      ["00", "00"],
      ["00", "00"],
    ]);
    expect(texts(editor)[0][0]).toBe("a");
  });
});

describe("不变式", () => {
  it("越界跨度截断，1 省略", () => {
    const editor = setup([
      grid([
        [{ text: "a", rowSpan: 5, colSpan: 1 }, "b"],
        ["c", "d"],
      ]),
    ]);
    expect(spans(editor)[0][0]).toBe("20");
  });

  it("被覆盖格的跨度去掉，内容移到原点格末尾", () => {
    const editor = setup([
      grid([
        [
          { text: "a", colSpan: 2 },
          { text: "b", rowSpan: 2 },
        ],
        ["c", "d"],
      ]),
    ]);
    expect(spans(editor)).toEqual([
      ["02", "00"],
      ["00", "00"],
    ]);
    expect(texts(editor)[0]).toEqual(["a\nb", ""]);
  });
});

describe("行列变换感知合并", () => {
  const base = () =>
    setup([
      grid([
        [{ text: "a", rowSpan: 3, colSpan: 2 }, "", "x"],
        ["", "", "y"],
        ["", "", "z"],
        ["p", "q", "r"],
      ]),
    ]);

  it("插入到区域内部时跨度增长，边界上不变", () => {
    const editor = base();
    insertRows(editor, [0], 1);
    expect(spans(editor)[0][0]).toBe("42");
    insertRows(editor, [0], 4);
    expect(spans(editor)[0][0]).toBe("42");
    insertColumns(editor, [0], 1);
    expect(spans(editor)[0][0]).toBe("43");
  });

  it("删除区域一部分时收缩；删掉原点行时内容与跨度移到剩下的第一行", () => {
    const editor = base();
    deleteRows(editor, [0], 0);
    expect(texts(editor)[0][0]).toBe("a");
    expect(spans(editor)[0][0]).toBe("22");
    deleteColumns(editor, [0], 1);
    expect(spans(editor)[0][0]).toBe("20");
    expect(texts(editor)[0]).toEqual(["a", "y"]);
  });

  it("移动会切开区域时拒绝", () => {
    const editor = base();
    expect(moveRow(editor, [0], 1, 3)).toBe(false);
    expect(moveRow(editor, [0], 3, 1)).toBe(false);
    expect(moveRow(editor, [0], 3, 0)).toBe(true);
  });
});

describe("格选区与复制粘贴", () => {
  it("选中被跨行合并覆盖的行时，只复制和删除指定行", () => {
    const editor = setup([
      grid([
        [{ text: "a", rowSpan: 2 }, "b"],
        ["", "c"],
        ["d", "e"],
      ]),
    ]);
    selectRows(editor, [0], 1);
    expect(getCellSelection(editor)).toEqual({
      tablePath: [0],
      ...rect(1, 0, 1, 1),
      kind: "row",
    });
    expect((editor.getFragment()[0] as TableElement).children).toHaveLength(1);
    editor.deleteFragment();
    expect(texts(editor)).toEqual([
      ["a", "b"],
      ["d", "e"],
    ]);
  });

  it("选中被跨列合并覆盖的列时，只删除指定列", () => {
    const editor = setup([
      grid([
        [{ text: "a", colSpan: 2 }, "", "c"],
        ["d", "e", "f"],
      ]),
    ]);
    selectColumns(editor, [0], 1);
    expect(getCellSelection(editor)).toEqual({
      tablePath: [0],
      ...rect(0, 1, 1, 1),
      kind: "col",
    });
    editor.deleteFragment();
    expect(texts(editor)).toEqual([
      ["a", "c"],
      ["d", "f"],
    ]);
  });

  it("删除空合并格覆盖的行后清除原逻辑选区", () => {
    const editor = setup([grid([[{ text: "", rowSpan: 2 }], [""]])]);
    selectRows(editor, [0], 1);
    editor.deleteFragment();
    expect(texts(editor)).toEqual([[""]]);
    expect(getCellSelection(editor)).toBeUndefined();
  });

  it("选区扩到包住整块，端点落在原点格", () => {
    const editor = setup([
      grid([
        ["a", { text: "b", rowSpan: 2 }, "c"],
        ["d", "", "f"],
      ]),
    ]);
    selectCells(editor, [0], rect(1, 0, 1, 1));
    const selection = getCellSelection(editor);
    expect(
      selection && rect(selection.rowStart, selection.colStart, selection.rowEnd, selection.colEnd)
    ).toEqual(rect(0, 0, 1, 1));
    expect(editor.selection?.focus.path).toEqual([0, 0, 1, 0]);
  });

  it("HTML 表格写出 rowspan / colspan，粘贴解析还原跨度", () => {
    const editor = setup([
      grid([
        [{ text: "a", colSpan: 2 }, "", "b"],
        [{ text: "c", rowSpan: 2 }, "d", "e"],
        ["", "f", "g"],
      ]),
    ]);
    const html = toHtmlTable(tableAt(editor), false);
    expect(html).toContain('<td colspan="2">a</td><td>b</td>');
    expect(html).toContain('<td rowspan="2">c</td>');
    const parsed = parseHtmlTableGrid(html);
    expect(parsed?.texts).toEqual([
      ["a", "", "b"],
      ["c", "d", "e"],
      ["", "f", "g"],
    ]);
    expect(parsed?.spans[0][0]).toEqual({ colSpan: 2 });
    expect(parsed?.spans[1][0]).toEqual({ rowSpan: 2 });
  });

  it("HTML 往返保留被合并格完全覆盖的空行", () => {
    const editor = setup([
      grid([
        [{ text: "a", rowSpan: 2, colSpan: 2 }, ""],
        ["", ""],
        ["b", "c"],
      ]),
    ]);
    const parsed = parseHtmlTableGrid(toHtmlTable(tableAt(editor), false));
    expect(parsed?.texts).toEqual([
      ["a", ""],
      ["", ""],
      ["b", "c"],
    ]);
    expect(parsed?.spans[0][0]).toEqual({ rowSpan: 2, colSpan: 2 });
  });
});

describe("拆分与粘贴的作用范围", () => {
  const base = () =>
    setup([
      grid([
        [{ text: "a", rowSpan: 2, colSpan: 2 }, "", { text: "b", colSpan: 2 }, ""],
        ["", "", "c", "d"],
      ]),
    ]);

  it("仅拆开与所选行直接相交的合并格，菜单计数一致", () => {
    const editor = base();
    const target = rect(1, 0, 1, 3);
    expect(mergedCellCount(tableAt(editor), target)).toBe(1);
    splitCells(editor, [0], target);
    expect(spans(editor)[0]).toEqual(["00", "00", "02", "00"]);
    expect(texts(editor)[0]).toEqual(["a", "", "b", ""]);
  });

  it("向下一行粘贴不会拆开上一行不相交的合并格", () => {
    const editor = base();
    fillCells(editor, [0], 1, 0, [["w", "x", "y", "z"].map(text => [{ type: "formatted", text }])]);
    expect(spans(editor)[0]).toEqual(["00", "00", "02", "00"]);
    expect(texts(editor)).toEqual([
      ["a", "", "b", ""],
      ["w", "x", "y", "z"],
    ]);
  });
});
