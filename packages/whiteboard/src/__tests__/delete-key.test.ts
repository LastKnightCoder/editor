import { describe, expect, it } from "vitest";
import Board from "../Board";
import { SelectPlugin } from "../plugins/SelectPlugin";
import { createStandardWhiteboardExtensions } from "../extensions/builtins";

describe("选中元素的删除按键", () => {
  it.each([false, true])("扩展装配=%s 时 Delete 删除选中元素", extensions => {
    const node = { id: "shape", type: "geometry", x: 10, y: 10, width: 100, height: 80 };
    const board = new Board(
      [node],
      { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 },
      { selectedElements: [node], selectArea: null },
      extensions ? [] : [new SelectPlugin()]
    );
    if (extensions) board.installExtensions(createStandardWhiteboardExtensions());
    try {
      board.onKeyDown(new KeyboardEvent("keydown", { key: "Delete", keyCode: 46, which: 46 }));
      expect(board.children).toEqual([]);
    } finally {
      board.destroy();
    }
  });

  it.each([false, true])("扩展装配=%s 时移除编辑中的元素不会阻断其他元素删除", extensions => {
    const text = { id: "empty-text", type: "richtext", content: [] };
    const shape = { id: "shape", type: "handwrite", x: 10, y: 10, width: 100, height: 80 };
    const board = new Board(
      [text, shape],
      { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 },
      { selectedElements: [shape], selectArea: null },
      extensions ? [] : [new SelectPlugin()]
    );
    if (extensions) board.installExtensions(createStandardWhiteboardExtensions());
    try {
      board.isEditingElements = [text.id];
      board.apply({ type: "remove_node", path: [0], node: text });
      board.onKeyDown(new KeyboardEvent("keydown", { key: "Delete", keyCode: 46, which: 46 }));
      expect(board.children).toEqual([]);
    } finally {
      board.destroy();
    }
  });
});
