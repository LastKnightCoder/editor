import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Board from "../Board";
import type { BoardElement } from "../types";
import { CopyPastePlugin } from "../plugins/CopyPastePlugin";
import { buildClipboardPayload } from "../utils/ClipboardUtil";

const viewport = { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 };

const createStickyChild = (): BoardElement => ({
  id: "acme-item-1",
  type: "acme.sticky-item",
  x: 50,
  y: 70,
  width: 30,
  height: 20,
  data: { text: "子项", tags: ["x"], nested: { n: 2 } },
  customFlag: false,
  schemaVersion: 3,
});

const createUnknownSticky = (): BoardElement => ({
  id: "acme-sticky-1",
  type: "acme.sticky",
  x: 40,
  y: 60,
  width: 200,
  height: 120,
  data: { text: "你好", tags: ["a"], nested: { n: 1 } },
  customFlag: true,
  schemaVersion: 7,
  children: [createStickyChild()],
});

const createGeometry = (): BoardElement => ({
  id: "geo-1",
  type: "geometry",
  x: 0,
  y: 0,
  width: 100,
  height: 80,
});

const boards: Board[] = [];
const createBoard = () => {
  const board = new Board([createGeometry(), createUnknownSticky()], viewport, {
    selectedElements: [],
    selectArea: null,
  });
  boards.push(board);
  return board;
};

afterEach(() => {
  boards.splice(0).forEach(board => board.destroy());
  vi.restoreAllMocks();
});

describe("未知类型元素原样保留（往返）", () => {
  it("加载后不做任何操作，快照 children 与输入深相等", () => {
    const board = createBoard();
    expect(board.getSnapshot().children).toEqual([createGeometry(), createUnknownSticky()]);
    expect(board.getSnapshot().children[1]).toEqual(createUnknownSticky());
  });

  it("修改内置元素（set_node）后未知元素保持不变", () => {
    const board = createBoard();
    board.apply({
      type: "set_node",
      path: [0],
      properties: { x: 0 },
      newProperties: { x: 11 },
    });
    expect(board.children[0]).toEqual({ ...createGeometry(), x: 11 });
    expect(board.children[1]).toEqual(createUnknownSticky());
  });

  it("移动未知元素：父子 x/y 按位移平移，其余字段不变", () => {
    const board = createBoard();
    const original = board.children[1];
    const moved = board.moveElement(original, 15, -5);
    expect(moved).toEqual({
      ...createUnknownSticky(),
      x: 55,
      y: 55,
      children: [{ ...createStickyChild(), x: 65, y: 65 }],
    });
    // moveElement 是纯函数，不改写文档
    expect(board.children[1]).toEqual(createUnknownSticky());
  });

  it("删除后 undo 完整恢复，redo 后消失，再 undo 又完整恢复", () => {
    const board = createBoard();
    const node = board.children[1];
    board.apply({ type: "remove_node", path: [1], node });
    expect(board.children.map(element => element.id)).toEqual(["geo-1"]);

    board.undo();
    expect(board.children[1]).toEqual(createUnknownSticky());

    board.redo();
    expect(board.children.map(element => element.id)).toEqual(["geo-1"]);

    board.undo();
    expect(board.children[1]).toEqual(createUnknownSticky());
  });

  it("复制粘贴：序列化与反序列化后除 id 与 +20 偏移外字段完整保留", () => {
    const board = createBoard();
    const payload = buildClipboardPayload(board, [board.children[1]])!;
    expect(JSON.parse(payload).source).toBe("editor-white-board");

    const plugin = new CopyPastePlugin();
    const event = new Event("paste", { cancelable: true }) as ClipboardEvent;
    Object.defineProperty(event, "clipboardData", {
      value: {
        items: [],
        getData: (type: string) =>
          type === "application/json" || type === "text/plain" ? payload : "",
      },
    });
    plugin.onPaste(event, board);

    expect(event.defaultPrevented).toBe(true);
    expect(board.children).toHaveLength(3);
    const pasted = board.children[2];
    // 粘贴流程改变的字段：id（父子均换成新 uuid）与 x/y（复制时 +20 偏移，含子元素）
    expect(pasted.id).not.toBe("acme-sticky-1");
    expect(pasted.children![0].id).not.toBe("acme-item-1");
    expect(pasted).toEqual({
      ...createUnknownSticky(),
      id: pasted.id,
      x: 60,
      y: 80,
      children: [{ ...createStickyChild(), id: pasted.children![0].id, x: 70, y: 90 }],
    });
    // 原元素不受粘贴影响
    expect(board.children[1]).toEqual(createUnknownSticky());
  });

  it("扩展 API：getSnapshot 字段完整，updateElement 只改补丁字段", () => {
    const board = createBoard();
    board.installExtensions([]);
    const api = board.extensions!.api;
    expect(api.getSnapshot().children[1]).toEqual(createUnknownSticky());
    expect(api.updateElement("acme-sticky-1", { x: 5 })).toBe(true);
    expect(api.getSnapshot().children[1]).toEqual({ ...createUnknownSticky(), x: 5 });
    expect(api.getSnapshot().children[0]).toEqual(createGeometry());
  });

  it("JSON 往返：落库再加载后与原始深相等", () => {
    const board = createBoard();
    const persisted = JSON.parse(JSON.stringify(board.getSnapshot()));
    const reloaded = new Board(persisted.children as BoardElement[], viewport, {
      selectedElements: [],
      selectArea: null,
    });
    boards.push(reloaded);
    expect(reloaded.getSnapshot().children).toEqual([createGeometry(), createUnknownSticky()]);
  });

  it("渲染层：未知元素渲染占位节点且不抛错", () => {
    const board = createBoard();
    const html = renderToStaticMarkup(<svg>{board.renderElement(board.children[1])}</svg>);
    expect(html).toContain('data-unknown-element="acme-sticky-1"');
    expect(html).toContain('data-unknown-element="acme-item-1"');
  });
});
