import { describe, expect, it } from "vitest";
import { Node, type Editor } from "slate";

import { resolveTableContext, type TableEditingContext } from "../editingContext";
import {
  getColumnAlign,
  isTableActionDisabled,
  nextColumnAlign,
  runTableAction,
} from "../tableActions";
import { caretInCell, createTableEditor } from "./tableTestUtils";

function contextOf(editor: Editor): TableEditingContext {
  const context = resolveTableContext(editor);
  if (!context) throw new Error("光标不在表格内");
  return context;
}

const cellText = (editor: Editor, row: number, col: number) =>
  Node.string(Node.get(editor, [1, row, col]));

describe("tableActions", () => {
  it("下方插行后光标落在新行同列单元格开头", () => {
    const editor = createTableEditor(3, 3, { selection: caretInCell(1, 2) });
    expect(runTableAction(editor, "insert-row-below", contextOf(editor))).toBe(true);
    expect(contextOf(editor)).toMatchObject({ row: 2, col: 2, rowCount: 4, colCount: 3 });
    expect(cellText(editor, 2, 2)).toBe("");
    expect(editor.selection?.anchor).toEqual({ path: [1, 2, 2, 0], offset: 0 });
  });

  it("右侧插列后光标落在新列同行单元格开头", () => {
    const editor = createTableEditor(2, 2, { selection: caretInCell(1, 0) });
    runTableAction(editor, "insert-column-right", contextOf(editor));
    expect(contextOf(editor)).toMatchObject({ row: 1, col: 1, colCount: 3 });
    expect(cellText(editor, 1, 1)).toBe("");
    expect(editor.selection?.anchor.offset).toBe(0);
  });

  it("删行后光标移到相邻行，删末行时取上一行", () => {
    const editor = createTableEditor(4, 2, { selection: caretInCell(1, 1) });
    runTableAction(editor, "delete-row", contextOf(editor));
    expect(contextOf(editor)).toMatchObject({ row: 1, col: 1, rowCount: 3 });
    expect(cellText(editor, 1, 1)).toBe("r2c1");

    const last = createTableEditor(3, 2, { selection: caretInCell(2, 0) });
    runTableAction(last, "delete-row", contextOf(last));
    expect(contextOf(last)).toMatchObject({ row: 1, col: 0, rowCount: 2 });
  });

  it("删列后光标移到相邻列", () => {
    const editor = createTableEditor(2, 3, { selection: caretInCell(0, 2) });
    runTableAction(editor, "delete-column", contextOf(editor));
    expect(contextOf(editor)).toMatchObject({ row: 0, col: 1, colCount: 2 });
  });

  it("删行至少保留表头 + 一行，删列至少保留一列，移动不越界", () => {
    const base = { tablePath: [1], kind: "table" as const };
    const twoRows = { ...base, row: 0, col: 0, rowCount: 2, colCount: 1 };
    expect(isTableActionDisabled("delete-row", twoRows)).toBe(true);
    expect(isTableActionDisabled("delete-column", twoRows)).toBe(true);
    expect(isTableActionDisabled("move-row-up", twoRows)).toBe(true);
    expect(isTableActionDisabled("move-row-down", twoRows)).toBe(false);
    expect(isTableActionDisabled("move-column-left", twoRows)).toBe(true);
    expect(isTableActionDisabled("move-column-right", twoRows)).toBe(true);

    const roomy = { ...base, row: 2, col: 1, rowCount: 3, colCount: 2 };
    expect(isTableActionDisabled("delete-row", roomy)).toBe(false);
    expect(isTableActionDisabled("delete-column", roomy)).toBe(false);
    expect(isTableActionDisabled("move-row-down", roomy)).toBe(true);
    expect(isTableActionDisabled("move-column-right", roomy)).toBe(true);

    const editor = createTableEditor(2, 2, { selection: caretInCell(1, 0) });
    expect(runTableAction(editor, "delete-row", contextOf(editor))).toBe(false);
    expect(contextOf(editor).rowCount).toBe(2);
  });

  it("对齐循环：左（未指定）→ 居中 → 居右 → 左", () => {
    expect(nextColumnAlign(null)).toBe("center");
    expect(nextColumnAlign("left")).toBe("center");
    expect(nextColumnAlign("center")).toBe("right");
    expect(nextColumnAlign("right")).toBeNull();

    const editor = createTableEditor(2, 2, { selection: caretInCell(1, 1) });
    const sequence = [];
    for (let i = 0; i < 3; i++) {
      runTableAction(editor, "cycle-align", contextOf(editor));
      sequence.push(getColumnAlign(editor, contextOf(editor)));
    }
    expect(sequence).toEqual(["center", "right", null]);
    expect(getColumnAlign(editor, { ...contextOf(editor), col: 0 })).toBeNull();
  });

  it("移动行列时光标跟随单元格，删除表格回到空段落", () => {
    const editor = createTableEditor(3, 3, { selection: caretInCell(1, 1, 2) });
    runTableAction(editor, "move-row-down", contextOf(editor));
    expect(cellText(editor, 2, 1)).toBe("r1c1");
    expect(contextOf(editor)).toMatchObject({ row: 2, col: 1 });
    expect(editor.selection?.anchor.offset).toBe(2);

    runTableAction(editor, "move-column-left", contextOf(editor));
    expect(cellText(editor, 2, 0)).toBe("r1c1");
    expect(contextOf(editor)).toMatchObject({ row: 2, col: 0 });

    runTableAction(editor, "delete-table", contextOf(editor));
    expect((editor.children[1] as { type?: string }).type).toBe("paragraph");
    expect(resolveTableContext(editor)).toBeNull();
  });
});
