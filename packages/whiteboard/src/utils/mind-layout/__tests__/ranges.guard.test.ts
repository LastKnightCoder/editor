import { expect, it } from "vitest";
import type { MindNodeElement } from "../../../types";
import MindUtil from "../../MindUtil";
import { boundaryBox, subtreeBox } from "../ranges";

const node = (id: string, children: MindNodeElement[] = []): MindNodeElement => ({
  id,
  type: "mind-node",
  x: 10,
  y: 20,
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

it("逐层嵌套外框只按节点规模读取几何，不能指数重复遍历", () => {
  // 21 个节点曾产生两百多万次几何读取，正常深度预算内即可卡住编辑。
  let reads = 0;
  const tracked = (value: MindNodeElement) => {
    Object.defineProperty(value, "x", {
      get: () => {
        reads++;
        return 10;
      },
    });
    return value;
  };
  let tree = tracked(node("leaf"));
  const depth = 20;
  for (let i = 0; i < depth; i++) {
    const parent = node(`parent-${i}`, [tree]);
    parent.boundaries = [{ id: `boundary-${i}`, startId: tree.id, endId: tree.id }];
    tree = tracked(parent);
  }
  const box = subtreeBox(tree, false);
  expect(box.x).toBeLessThan(10);
  expect(box.width).toBeGreaterThan(tree.width);
  expect(reads).toBeLessThanOrEqual((depth + 1) * 8);
});

it("外框几何随坐标与折叠变化重算，不复用上次查询的结果", () => {
  const root = node("root", [node("child", [node("leaf")])]);
  root.boundaries = [{ id: "boundary", startId: "child", endId: "child" }];
  const placed = MindUtil.layout(root);
  const original = boundaryBox(placed, placed.boundaries![0], true)!;
  const moved = MindUtil.moveAll(placed, 200, 100);
  const translated = boundaryBox(moved, moved.boundaries![0], true)!;
  expect(translated).toEqual({ ...original, x: original.x + 200, y: original.y + 100 });
  const folded = MindUtil.toggleCollapsed(moved, "child")!;
  const collapsed = boundaryBox(folded, folded.boundaries![0], true)!;
  expect(collapsed.width).toBeLessThan(translated.width);
});
