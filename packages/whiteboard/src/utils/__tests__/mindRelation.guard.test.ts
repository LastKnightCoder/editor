import { expect, it } from "vitest";
import Board from "../../Board";
import { MindPlugin } from "../../plugins/MindPlugin";
import { createArrowExtension, createMindExtension } from "../../extensions/builtins";
import type { MindNodeElement } from "../../types";
import { createMindRelation, mindRelationOpacity } from "../mindRelation";
import MindUtil from "../MindUtil";
import { projectArrowTree } from "../ArrowProjection";
import BoardUtil from "../BoardUtil";

const node = (id: string, children: MindNodeElement[] = []): MindNodeElement => ({
  id,
  type: "mind-node",
  x: 0,
  y: 0,
  width: 80,
  height: 40,
  actualHeight: 40,
  level: 1,
  direction: "right",
  text: [],
  children,
  childrenHeight: 0,
  leftChildrenHeight: 0,
  rightChildrenHeight: 0,
});
const boardOf = (children: ConstructorParameters<typeof Board>[0]) =>
  new Board(
    children,
    { minX: 0, minY: 0, width: 800, height: 600, zoom: 1 },
    { selectedElements: [], selectArea: null }
  );

it("批量联系线查询只按快照与端点规模读取身份，不对每条线重新遍历导图", () => {
  // 1000 节点、500 联系线曾需要约六百万次身份读取，布局优化并未覆盖此路径。
  let reads = 0;
  const kids = Array.from({ length: 512 }, (_, i) => {
    const value = node(`node-${i}`);
    Object.defineProperty(value, "id", {
      get: () => {
        reads++;
        return `node-${i}`;
      },
    });
    return value;
  });
  const arrows = kids
    .filter((_, i) => i % 2 === 0)
    .map((from, i) => createMindRelation(from, kids[i * 2 + 1]));
  const board = boardOf([node("root", kids), ...arrows]);
  const plugin = new MindPlugin();
  reads = 0;
  for (const [i, arrow] of arrows.entries()) {
    const opacity = mindRelationOpacity(board, arrow);
    if (typeof opacity !== "number" || !Number.isFinite(opacity)) throw new Error("联系线状态无效");
    plugin.getArrowBindPoint(board, kids[i * 2], "center");
    plugin.getArrowBindPoint(board, kids[i * 2 + 1], "center");
  }
  expect(reads).toBeGreaterThan(0);
  expect(reads).toBeLessThanOrEqual((kids.length + arrows.length) * 6);
  board.destroy();
});

it("投影在发布前按传入的新树求折叠端点，后续展开和移动不复用旧索引", () => {
  const original = MindUtil.layout(node("root", [node("branch", [node("leaf")]), node("other")]));
  const leaf = MindUtil.findNodeInTree(original, "leaf")!;
  const other = MindUtil.findNodeInTree(original, "other")!;
  const arrow = createMindRelation(leaf, other);
  const board = boardOf([original, arrow]);
  board.installExtensions([createMindExtension(), createArrowExtension()]);
  try {
    const collapsed = MindUtil.toggleCollapsed(original, "branch")!;
    const visible = MindUtil.findNodeInTree(collapsed, "branch")!;
    const projected = projectArrowTree(board, [collapsed, arrow], value => value.type === "arrow");
    expect(projected[1].points[0]).toEqual({
      x: visible.x + visible.width / 2,
      y: visible.y + visible.height / 2,
    });
    expect(board.children[0]).toBe(original);
    const expandedOpacity = mindRelationOpacity(board, arrow);
    if (expandedOpacity === undefined) throw new Error("联系线未被识别");
    board.apply({
      type: "set_node",
      path: [0, 0],
      properties: {},
      newProperties: { isLeftFold: true, isRightFold: true },
    });
    expect(mindRelationOpacity(board, arrow)).toBeLessThan(expandedOpacity);
    const hidden = MindUtil.findNodeInTree(board.children[0] as MindNodeElement, "leaf")!;
    const ancestor = MindUtil.findNodeInTree(board.children[0] as MindNodeElement, "branch")!;
    expect(
      board.getArrowBindPoint({ ...hidden, x: hidden.x + 300, y: hidden.y + 100 }, "center")
    ).toEqual({
      x: ancestor.x + ancestor.width / 2 + 300,
      y: ancestor.y + ancestor.height / 2 + 100,
    });
    board.apply({
      type: "set_node",
      path: [0, 0],
      properties: {},
      newProperties: { isLeftFold: false, isRightFold: false },
    });
    expect(mindRelationOpacity(board, arrow)).toBe(expandedOpacity);
    const translated = MindUtil.moveAll(collapsed, 200, 100);
    const moved = projectArrowTree(board, [translated, arrow], value => value.type === "arrow");
    expect(moved[1].points[0]).toEqual({
      x: visible.x + visible.width / 2 + 200,
      y: visible.y + visible.height / 2 + 100,
    });
  } finally {
    board.destroy();
  }
});

it("本机移动和折叠在未挂载箭头视图时也更新端点，撤销重做恢复几何", () => {
  const original = MindUtil.layout(node("root", [node("branch", [node("leaf")]), node("other")]));
  const leaf = MindUtil.findNodeInTree(original, "leaf")!;
  const other = MindUtil.findNodeInTree(original, "other")!;
  const arrow = createMindRelation(leaf, other);
  const board = boardOf([original, arrow]);
  board.installExtensions([createMindExtension(), createArrowExtension()]);
  const start = { x: leaf.x + leaf.width / 2, y: leaf.y + leaf.height / 2 };
  const end = { x: other.x + other.width / 2, y: other.y + other.height / 2 };
  let changedPoints: unknown;
  board.on("element:change", elements => {
    changedPoints = elements.find((entry: { id: string }) => entry.id === arrow.id)?.points;
  });
  try {
    board.apply(BoardUtil.buildTranslateSubtreeOps(original, [0], 200, 100), true, "translate");
    expect(board.children[1].points).toEqual([
      { x: start.x + 200, y: start.y + 100 },
      { x: end.x + 200, y: end.y + 100 },
    ]);
    expect(changedPoints).toEqual(board.children[1].points);
    board.undo();
    expect(board.children[1].points).toEqual([start, end]);
    board.redo();
    const moved = board.children[0] as MindNodeElement;
    const collapsed = MindUtil.toggleCollapsed(moved, "branch")!;
    const visible = MindUtil.findNodeInTree(collapsed, "branch")!;
    board.apply(
      BoardUtil.normalizeOperations(BoardUtil.diffNode(moved, collapsed, [0])),
      true,
      "fold"
    );
    expect(board.children[1].points[0]).toEqual({
      x: visible.x + visible.width / 2,
      y: visible.y + visible.height / 2,
    });
    board.undo();
    expect(board.children[1].points[0]).toEqual({ x: start.x + 200, y: start.y + 100 });
  } finally {
    board.destroy();
  }
});
