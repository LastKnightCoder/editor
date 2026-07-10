import { describe, expect, it, vi } from "vitest";

const electronMocks = vi.hoisted(() => ({
  invoke: vi.fn(() => Promise.resolve({})),
  send: vi.fn(),
  sendSync: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  platform: "web",
}));
vi.mock("@/electron", () => electronMocks);

import type { Board, MindNodeElement } from "../../types";
import MindUtil from "../MindUtil";

const textStub = [{ type: "paragraph", children: [{ text: "" }] }] as any;

const createMindNode = (
  id: string,
  overrides: Partial<MindNodeElement> = {},
): MindNodeElement => ({
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

const createBoard = (children: MindNodeElement[], zoom = 1) =>
  ({
    children,
    viewPort: { minX: 0, minY: 0, width: 1200, height: 800, zoom },
  }) as unknown as Board;

describe("MindUtil 思维导图拖拽候选", () => {
  it("节点与父节点水平重叠时不应判定为左侧或右侧候选", () => {
    const parent = createMindNode("parent", { x: 100, y: 100 });
    const overlapsRight = createMindNode("overlaps-right", {
      x: 180,
      y: 100,
      level: 2,
    });
    const overlapsLeft = createMindNode("overlaps-left", {
      x: 20,
      y: 100,
      level: 2,
    });

    expect(
      MindUtil.calculateDragTargetDistance(overlapsRight, parent, "right", 1),
    ).toBeNull();
    expect(
      MindUtil.calculateDragTargetDistance(overlapsLeft, parent, "left", 1),
    ).toBeNull();

    expect(
      MindUtil.calculateDragTargetDistance(
        { ...overlapsRight, x: 200 },
        parent,
        "right",
        1,
      ),
    ).not.toBeNull();
    expect(
      MindUtil.calculateDragTargetDistance(
        { ...overlapsLeft, x: 0 },
        parent,
        "left",
        1,
      ),
    ).not.toBeNull();
  });

  it("同时计算水平和垂直距离，拒绝垂直方向过远的节点", () => {
    const parent = createMindNode("parent", { x: 100, y: 100 });
    const dragged = createMindNode("dragged", {
      x: 220,
      y: 260,
      level: 2,
    });

    const distance = MindUtil.calculateDragTargetDistance(
      dragged,
      parent,
      "right",
      1,
    );

    expect(distance?.horizontalDistance).toBe(20);
    expect(distance?.verticalDistance).toBe(120);
    expect(distance?.score).toBeGreaterThan(1);
  });

  it("在不同缩放下使用一致的屏幕距离评分", () => {
    const parent = createMindNode("parent", { x: 0, y: 0 });
    const zoomOne = createMindNode("zoom-one", { x: 160, y: 0, level: 2 });
    const zoomTwo = createMindNode("zoom-two", { x: 130, y: 0, level: 2 });

    const first = MindUtil.calculateDragTargetDistance(
      zoomOne,
      parent,
      "right",
      1,
    );
    const second = MindUtil.calculateDragTargetDistance(
      zoomTwo,
      parent,
      "right",
      2,
    );

    expect(first?.score).toBeCloseTo(0.5);
    expect(second?.score).toBeCloseTo(first?.score ?? 0);
  });

  it("只在可见节点中选择候选，并排除被拖子树", () => {
    const descendant = createMindNode("descendant", {
      x: 470,
      y: 100,
      level: 3,
    });
    const dragged = createMindNode("dragged", {
      x: 440,
      y: 100,
      level: 2,
      children: [descendant],
    });
    const sourceRoot = createMindNode("source", {
      x: 0,
      y: 100,
      children: [dragged],
    });
    const hiddenChild = createMindNode("hidden", {
      x: 430,
      y: 100,
      level: 2,
    });
    const targetRoot = createMindNode("target", {
      x: 300,
      y: 100,
      children: [hiddenChild],
      isRightFold: true,
    });

    const target = MindUtil.findNearestMindNode(
      createBoard([sourceRoot, targetRoot]),
      dragged,
    );

    expect(target?.node.id).toBe("target");
    expect(target?.direction).toBe("right");
  });

  it("根节点折叠一侧时仍可命中另一侧的可见节点", () => {
    const dragged = createMindNode("dragged", {
      x: 540,
      y: 100,
      level: 2,
    });
    const sourceRoot = createMindNode("source", {
      x: 0,
      y: 100,
      children: [dragged],
    });
    const visibleRight = createMindNode("visible-right", {
      x: 400,
      y: 100,
      level: 2,
    });
    const hiddenLeft = createMindNode("hidden-left", {
      x: 264,
      y: 100,
      level: 2,
      direction: "left",
    });
    const targetRoot = createMindNode("target", {
      x: 300,
      y: 100,
      children: [hiddenLeft, visibleRight],
      isLeftFold: true,
    });

    const target = MindUtil.findNearestMindNode(
      createBoard([sourceRoot, targetRoot]),
      dragged,
    );

    expect(target?.node.id).toBe("visible-right");
  });

  it("同父重排基于排除自身后的兄弟索引", () => {
    const first = createMindNode("first", { y: 0, level: 2 });
    const dragged = createMindNode("dragged", { y: 60, level: 2 });
    const last = createMindNode("last", { y: 120, level: 2 });
    const parent = createMindNode("parent", {
      children: [first, dragged, last],
    });

    const placement = MindUtil.calculateInsertPosition(
      parent,
      { x: 0, y: 200 },
      "right",
      dragged.id,
    );
    const moved = MindUtil.moveNodeToNewParent(
      parent,
      parent,
      dragged,
      parent,
      placement.insertIndex,
      placement.direction,
    );

    expect(placement.insertIndex).toBe(2);
    expect(moved.children.map((child) => child.id)).toEqual([
      "first",
      "last",
      "dragged",
    ]);
  });
});
