import { afterEach, describe, expect, it, vi } from "vitest";
import Board from "../Board";
import {
  DOCUMENT_OPEN_EVENT,
  DocumentPlugin,
  type DocumentElement,
} from "../plugins/DocumentPlugin";
import { BOARD_TO_CONTAINER } from "../constants/map";
import { CANVAS_OVERLAY_ATTR, ownsBoardEvent } from "../utils/events";
import { DEFAULT_PAGE_SKETCH } from "../types";

const doc: DocumentElement = {
  id: "doc",
  type: "document",
  entityRef: { kind: "article", id: 3 },
  x: 0,
  y: 0,
  width: 280,
  height: 360,
};

const createBoard = (selected: DocumentElement[] = []) => {
  const board = new Board(
    [doc],
    { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 },
    { selectedElements: selected, selectArea: null },
    [],
    [],
    false,
    DEFAULT_PAGE_SKETCH
  );
  board.initPlugins([new DocumentPlugin()]);
  return board;
};

const menuContext = (targetElements: DocumentElement[]) => ({
  clientX: 0,
  clientY: 0,
  viewPortPoint: { x: 0, y: 0 },
  selectedElements: targetElements,
  hitElements: targetElements,
  targetElements,
  isHitSelected: targetElements.length > 0,
});

let board: Board | null = null;
afterEach(() => {
  board?.destroy();
  board = null;
  document.body.innerHTML = "";
});

describe("文档卡", () => {
  it("选中一张文档卡时 ↵ 请求展开", () => {
    board = createBoard([doc]);
    const open = vi.fn();
    board.on(DOCUMENT_OPEN_EVENT, open);
    board.onKeyDown(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(open).toHaveBeenCalledWith("doc");
  });

  it("焦点在可编辑区域或未选中时 ↵ 不展开", () => {
    board = createBoard([doc]);
    const open = vi.fn();
    board.on(DOCUMENT_OPEN_EVENT, open);
    const event = new KeyboardEvent("keydown", { key: "Enter" });
    Object.defineProperty(event, "target", { value: document.createElement("input") });
    board.onKeyDown(event);
    board.destroy();

    board = createBoard([]);
    board.on(DOCUMENT_OPEN_EVENT, open);
    board.onKeyDown(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(open).not.toHaveBeenCalled();
  });

  it("右键「展开」需要宿主提供阅读层，「文档」创建需要宿主弹窗层", () => {
    board = createBoard();
    const keys = (targets: DocumentElement[]) =>
      board!.getContextMenu(menuContext(targets)).map(item => item.key);
    expect(keys([doc])).not.toContain("open-document");
    expect(keys([])).not.toContain("create-document");
    board.slots = { CanvasLayer: () => null, Layers: () => null };
    expect(keys([doc])).toContain("open-document");
    expect(keys([])).toContain("create-document");
  });

  it("画布内宿主浮层里的事件不归画布", () => {
    board = createBoard();
    const root = document.createElement("div");
    root.setAttribute("data-whiteboard-root", "");
    const overlay = document.createElement("div");
    overlay.setAttribute(CANVAS_OVERLAY_ATTR, "");
    const editor = document.createElement("div");
    overlay.append(editor);
    root.append(overlay);
    document.body.append(root);
    BOARD_TO_CONTAINER.set(board, root);

    const at = (target: Element) => {
      const event = new Event("copy");
      Object.defineProperty(event, "target", { value: target });
      return ownsBoardEvent(board!, event);
    };
    expect(at(root)).toBe(true);
    expect(at(editor)).toBe(false);
  });
});
