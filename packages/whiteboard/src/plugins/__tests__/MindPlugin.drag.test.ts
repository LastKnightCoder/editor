/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import Board from "../../Board";
import { BOARD_TO_CONTAINER } from "../../constants";
import type { MindNodeElement, Selection, ViewPort } from "../../types";
import { MindPlugin } from "../MindPlugin";

const textStub = [{ type: "paragraph", children: [{ text: "" }] }] as any;
const viewPort: ViewPort = {
  minX: 0,
  minY: 0,
  width: 1000,
  height: 800,
  zoom: 1,
};
const emptySelection: Selection = {
  selectArea: null,
  selectedElements: [],
};

const createMindNode = (id: string, overrides: Partial<MindNodeElement> = {}): MindNodeElement => ({
  id,
  type: "mind-node",
  x: overrides.x ?? 0,
  y: overrides.y ?? 0,
  width: overrides.width ?? 100,
  height: overrides.height ?? 40,
  actualHeight: overrides.actualHeight ?? overrides.height ?? 40,
  level: overrides.level ?? 1,
  children: overrides.children ?? [],
  childrenHeight: overrides.childrenHeight ?? 0,
  leftChildrenHeight: overrides.leftChildrenHeight ?? 0,
  rightChildrenHeight: overrides.rightChildrenHeight ?? 0,
  direction: overrides.direction ?? "right",
  text: overrides.text ?? textStub,
  ...overrides,
});

const pointerEvent = (
  clientX: number,
  clientY: number,
  pointerId = 1,
  overrides: Record<string, unknown> = {}
) =>
  ({
    button: 0,
    clientX,
    clientY,
    pointerId,
    preventDefault: vi.fn(),
    target: document.body,
    ...overrides,
  }) as unknown as PointerEvent;

const createBoard = (children: any[]) => {
  const plugin = new MindPlugin();
  // 普通元素桩：作为思维导图根节点拖拽时的对齐吸附目标
  const geometryStub = {
    name: "geometry",
    isHit: (_board: unknown, element: any, x: number, y: number) =>
      x >= element.x &&
      x <= element.x + element.width &&
      y >= element.y &&
      y <= element.y + element.height,
  };
  const board = new Board(children, viewPort, emptySelection, [plugin, geometryStub as any]);
  const container = document.createElement("div");
  container.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 1000,
      bottom: 800,
      width: 1000,
      height: 800,
      toJSON: () => ({}),
    }) as DOMRect;
  BOARD_TO_CONTAINER.set(board, container);
  return { board, plugin };
};

let scheduledFrame: FrameRequestCallback | null = null;

beforeEach(() => {
  scheduledFrame = null;
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      scheduledFrame = callback;
      return 1;
    })
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  BOARD_TO_CONTAINER.clear();
  vi.unstubAllGlobals();
});

const flushPointerMove = () => {
  const callback = scheduledFrame;
  scheduledFrame = null;
  callback?.(0);
};

describe("MindPlugin 思维导图节点拖拽", () => {
  it("移动阶段不修改文档，空白释放后一次提交为独立导图", () => {
    const dragged = createMindNode("dragged", {
      x: 136,
      y: 0,
      level: 2,
    });
    const sourceRoot = createMindNode("source", {
      children: [dragged],
      actualHeight: 40,
    });
    const { board, plugin } = createBoard([sourceRoot]);
    const beforeDrag = JSON.stringify(board.children);

    board.onPointerDown(pointerEvent(146, 20));
    expect(board.interactions.activePointerState?.name).toBe("mind-drag");
    board.onGlobalPointerMove(pointerEvent(600, 300));
    flushPointerMove();

    expect(plugin.getSnapshot().isDragging).toBe(true);
    expect(plugin.getSnapshot().previewNode).toMatchObject({ x: 590, y: 280 });
    expect(JSON.stringify(board.children)).toBe(beforeDrag);
    expect(board.undos).toHaveLength(0);

    board.onGlobalPointerUp(pointerEvent(600, 300));

    expect(board.children).toHaveLength(2);
    expect((board.children[0] as MindNodeElement).children).toHaveLength(0);
    expect(board.children[1]).toMatchObject({
      id: "dragged",
      level: 1,
      x: 590,
      y: 280,
    });
    expect(board.undos).toHaveLength(1);

    board.undo();
    expect(JSON.stringify(board.children)).toBe(beforeDrag);
  });

  it("候选父节点只显示在状态中，释放后才完成同树换父", () => {
    const dragged = createMindNode("dragged", {
      x: 136,
      y: 0,
      level: 2,
    });
    const target = createMindNode("target", {
      x: 136,
      y: 100,
      level: 2,
    });
    const root = createMindNode("root", {
      children: [dragged, target],
      actualHeight: 140,
      childrenHeight: 140,
      rightChildrenHeight: 140,
    });
    const { board, plugin } = createBoard([root]);
    const beforeDrag = JSON.stringify(board.children);

    board.onPointerDown(pointerEvent(146, 20));
    board.onGlobalPointerMove(pointerEvent(282, 120));
    flushPointerMove();

    expect(plugin.getSnapshot().currentTarget?.node.id).toBe("target");
    expect(JSON.stringify(board.children)).toBe(beforeDrag);

    board.onGlobalPointerUp(pointerEvent(282, 120));

    const updatedRoot = board.children[0] as MindNodeElement;
    expect(updatedRoot.children.map(node => node.id)).toEqual(["target"]);
    expect(updatedRoot.children[0].children.map(node => node.id)).toEqual(["dragged"]);
    expect(board.undos).toHaveLength(1);

    board.undo();
    expect(JSON.stringify(board.children)).toBe(beforeDrag);
  });

  it("跨导图换父只提交一个可撤销历史记录", () => {
    const dragged = createMindNode("dragged", {
      x: 136,
      y: 0,
      level: 2,
    });
    const sourceRoot = createMindNode("source", { children: [dragged] });
    const targetRoot = createMindNode("target", { x: 300, y: 100 });
    const { board, plugin } = createBoard([sourceRoot, targetRoot]);
    const beforeDrag = JSON.stringify(board.children);

    board.onPointerDown(pointerEvent(146, 20));
    board.onGlobalPointerMove(pointerEvent(446, 120));
    flushPointerMove();

    expect(plugin.getSnapshot().currentTarget?.node.id).toBe("target");
    expect(JSON.stringify(board.children)).toBe(beforeDrag);

    board.onGlobalPointerUp(pointerEvent(446, 120));

    expect((board.children[0] as MindNodeElement).children).toHaveLength(0);
    expect((board.children[1] as MindNodeElement).children.map(node => node.id)).toEqual([
      "dragged",
    ]);
    expect(board.undos).toHaveLength(1);

    board.undo();
    expect(JSON.stringify(board.children)).toBe(beforeDrag);
  });

  it("允许将根节点连同整棵导图吸附为另一棵导图的子节点", () => {
    const sourceChild = createMindNode("source-child", {
      x: 136,
      y: 0,
      level: 2,
    });
    const sourceRoot = createMindNode("source", {
      children: [sourceChild],
    });
    const targetRoot = createMindNode("target", { x: 300, y: 100 });
    const { board, plugin } = createBoard([sourceRoot, targetRoot]);
    const beforeDrag = JSON.stringify(board.children);

    board.onPointerDown(pointerEvent(10, 20));
    expect(board.interactions.activePointerState?.name).toBe("mind-drag");
    board.onGlobalPointerMove(pointerEvent(446, 120));
    flushPointerMove();

    expect(plugin.getSnapshot().mode).toBe("root-translate");
    expect(plugin.getSnapshot().currentTarget?.node.id).toBe("target");
    expect(plugin.isDraggingNode("source")).toBe(false);
    expect(board.children[0]).toMatchObject({ x: 436, y: 100 });
    expect((board.children[0] as MindNodeElement).children[0]).toMatchObject({
      x: 572,
      y: 100,
    });
    expect(board.undos).toHaveLength(0);

    board.onGlobalPointerUp(pointerEvent(446, 120));

    expect(board.children).toHaveLength(1);
    const updatedTarget = board.children[0] as MindNodeElement;
    expect(updatedTarget.id).toBe("target");
    expect(updatedTarget.children.map(node => node.id)).toEqual(["source"]);
    expect(updatedTarget.children[0]).toMatchObject({
      level: 2,
      direction: "right",
    });
    expect(updatedTarget.children[0].children[0]).toMatchObject({
      id: "source-child",
      level: 3,
      direction: "right",
    });
    expect(board.undos).toHaveLength(1);

    board.undo();
    expect(JSON.stringify(board.children)).toBe(beforeDrag);
  });

  it("根节点吸附到左侧时整棵子树统一为左方向", () => {
    const sourceLeftChild = createMindNode("source-left-child", {
      x: 564,
      y: 70,
      level: 2,
      direction: "left",
    });
    const sourceRightChild = createMindNode("source-right-child", {
      x: 836,
      y: 130,
      level: 2,
      direction: "right",
    });
    const targetRoot = createMindNode("target", { x: 300, y: 100 });
    const sourceRoot = createMindNode("source", {
      x: 700,
      y: 100,
      children: [sourceLeftChild, sourceRightChild],
    });
    const { board, plugin } = createBoard([targetRoot, sourceRoot]);
    const beforeDrag = JSON.stringify(board.children);

    board.onPointerDown(pointerEvent(710, 120));
    board.onGlobalPointerMove(pointerEvent(174, 120));
    flushPointerMove();

    expect(plugin.getSnapshot().currentTarget).toMatchObject({
      direction: "left",
      node: { id: "target" },
    });
    expect(board.children).toHaveLength(2);
    const previewRoot = board.children[1] as MindNodeElement;
    expect(previewRoot).toMatchObject({ id: "source", direction: "left" });
    expect(previewRoot.children.map(node => node.direction)).toEqual(["left", "left"]);
    expect(previewRoot.children.every(node => node.x < previewRoot.x)).toBe(true);
    expect(board.undos).toHaveLength(0);

    board.onGlobalPointerUp(pointerEvent(174, 120));

    expect(board.children).toHaveLength(1);
    const attachedRoot = (board.children[0] as MindNodeElement).children[0];
    expect(attachedRoot).toMatchObject({ id: "source", direction: "left" });
    expect(
      attachedRoot.children.map(node => ({
        id: node.id,
        direction: node.direction,
      }))
    ).toEqual([
      { id: "source-left-child", direction: "left" },
      { id: "source-right-child", direction: "left" },
    ]);
    expect(attachedRoot.children.every(node => node.x < attachedRoot.x)).toBe(true);

    board.undo();
    expect(JSON.stringify(board.children)).toBe(beforeDrag);
  });

  it("根节点释放到空白时只平移原导图", () => {
    const child = createMindNode("child", {
      x: 136,
      y: 0,
      level: 2,
    });
    const root = createMindNode("root", { children: [child] });
    const { board } = createBoard([root]);
    const beforeDrag = JSON.stringify(board.children);
    const onMove = vi.fn();
    const onMoveEnd = vi.fn();
    board.on("element:move", onMove);
    board.on("element:move-end", onMoveEnd);

    board.onPointerDown(pointerEvent(10, 20));
    board.onGlobalPointerMove(pointerEvent(600, 300));
    flushPointerMove();

    expect(board.children[0]).toMatchObject({ id: "root", x: 590, y: 280 });
    expect((board.children[0] as MindNodeElement).children[0]).toMatchObject({
      id: "child",
      x: 726,
      y: 280,
    });
    expect(board.undos).toHaveLength(0);
    expect(onMove).toHaveBeenCalledWith([expect.objectContaining({ id: "root", x: 590, y: 280 })]);

    board.onGlobalPointerUp(pointerEvent(600, 300));

    expect(board.children).toHaveLength(1);
    expect(board.children[0]).toMatchObject({ id: "root", x: 590, y: 280 });
    expect((board.children[0] as MindNodeElement).children[0]).toMatchObject({
      id: "child",
      x: 726,
      y: 280,
    });
    expect(board.undos).toHaveLength(1);
    expect(onMoveEnd).toHaveBeenCalledTimes(1);

    board.undo();
    expect(JSON.stringify(board.children)).toBe(beforeDrag);
  });

  it("取消根节点实时平移时恢复整棵导图的初始位置", () => {
    const child = createMindNode("child", {
      x: 136,
      y: 0,
      level: 2,
    });
    const root = createMindNode("root", { children: [child] });
    const { board, plugin } = createBoard([root]);
    const beforeDrag = JSON.stringify(board.children);

    board.onPointerDown(pointerEvent(10, 20));
    board.onGlobalPointerMove(pointerEvent(600, 300));
    flushPointerMove();
    expect(JSON.stringify(board.children)).not.toBe(beforeDrag);

    board.onGlobalPointerCancel(pointerEvent(600, 300));

    expect(JSON.stringify(board.children)).toBe(beforeDrag);
    expect(plugin.getSnapshot().mode).toBeNull();
    expect(board.undos).toHaveLength(0);
  });

  it("取消拖拽或未超过阈值时不提交任何操作", () => {
    const dragged = createMindNode("dragged", {
      x: 136,
      y: 0,
      level: 2,
    });
    const root = createMindNode("root", { children: [dragged] });
    const { board, plugin } = createBoard([root]);
    const beforeDrag = JSON.stringify(board.children);

    board.onPointerDown(pointerEvent(146, 20));
    board.onGlobalPointerMove(pointerEvent(400, 300));
    flushPointerMove();
    board.onGlobalPointerCancel(pointerEvent(400, 300));

    expect(plugin.getSnapshot().isDragging).toBe(false);
    expect(JSON.stringify(board.children)).toBe(beforeDrag);
    expect(board.undos).toHaveLength(0);

    board.onPointerDown(pointerEvent(146, 20));
    board.onGlobalPointerUp(pointerEvent(150, 20));
    expect(JSON.stringify(board.children)).toBe(beforeDrag);
    expect(board.undos).toHaveLength(0);
  });

  it("点击 mind 节点（未拖动）选中该节点", () => {
    const dragged = createMindNode("dragged", {
      x: 136,
      y: 0,
      level: 2,
    });
    const root = createMindNode("root", { children: [dragged] });
    const { board } = createBoard([root]);

    board.onPointerDown(pointerEvent(146, 20));
    board.onGlobalPointerUp(pointerEvent(146, 20));

    expect(board.selection.selectedElements.map(el => el.id)).toEqual(["dragged"]);
  });

  it("拖拽根节点靠近其他元素时对齐吸附，子树整体对齐", () => {
    const child = createMindNode("child", { x: 136, y: 0, level: 2 });
    const root = createMindNode("root", { children: [child] });
    const geometry = {
      id: "geo",
      type: "geometry",
      x: 300,
      y: 100,
      width: 100,
      height: 40,
      children: [],
    };
    const { board } = createBoard([root, geometry]);

    // 从根节点按下（offset 10,20），移动使预览位置为 (298, 96)，
    // 与 geometry(300,100) 的左/上边缘距离均在吸附阈值内
    board.onPointerDown(pointerEvent(10, 20));
    board.onGlobalPointerMove(pointerEvent(308, 116));
    flushPointerMove();

    expect(board.children[0]).toMatchObject({ id: "root", x: 300, y: 100 });
    expect((board.children[0] as MindNodeElement).children[0]).toMatchObject({
      id: "child",
      x: 436,
      y: 100,
    });

    board.onGlobalPointerUp(pointerEvent(308, 116));
    expect(board.children[0]).toMatchObject({ id: "root", x: 300, y: 100 });
  });

  it("按住 Alt 拖拽根节点不吸附", () => {
    const child = createMindNode("child", { x: 136, y: 0, level: 2 });
    const root = createMindNode("root", { children: [child] });
    const geometry = {
      id: "geo",
      type: "geometry",
      x: 300,
      y: 100,
      width: 100,
      height: 40,
      children: [],
    };
    const { board } = createBoard([root, geometry]);

    board.onPointerDown(pointerEvent(10, 20));
    board.onGlobalPointerMove(pointerEvent(308, 116, 1, { altKey: true }));
    flushPointerMove();

    expect(board.children[0]).toMatchObject({ id: "root", x: 298, y: 96 });
  });

  it("ctrl 点击 mind 节点在多选中切换", () => {
    const dragged = createMindNode("dragged", {
      x: 136,
      y: 0,
      level: 2,
    });
    const root = createMindNode("root", { children: [dragged] });
    const { board } = createBoard([root]);

    // 已选中 root，ctrl 点击 dragged → 两个都在选中集
    board.apply(
      {
        type: "set_selection",
        properties: board.selection,
        newProperties: { selectedElements: [root] },
      },
      false
    );

    board.onPointerDown(pointerEvent(146, 20));
    board.onGlobalPointerUp(pointerEvent(146, 20, 1, { ctrlKey: true } as Partial<PointerEvent>));

    expect(board.selection.selectedElements.map(el => el.id)).toEqual(["root", "dragged"]);

    // 再次 ctrl 点击 dragged → 从选中集移除
    board.onPointerDown(pointerEvent(146, 20));
    board.onGlobalPointerUp(pointerEvent(146, 20, 1, { ctrlKey: true } as Partial<PointerEvent>));
    expect(board.selection.selectedElements.map(el => el.id)).toEqual(["root"]);
  });
});
