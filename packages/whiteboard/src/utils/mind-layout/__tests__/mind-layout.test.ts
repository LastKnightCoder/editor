import { describe, expect, it } from "vitest";

import type { MindNodeElement } from "../../../types";
import MindUtil from "../../MindUtil";

const node = (
  id: string,
  overrides: Partial<MindNodeElement> = {},
  children: MindNodeElement[] = []
): MindNodeElement => ({
  id,
  type: "mind-node",
  x: 0,
  y: 0,
  width: 80,
  height: 40,
  actualHeight: 40,
  level: 1,
  children,
  childrenHeight: 0,
  leftChildrenHeight: 0,
  rightChildrenHeight: 0,
  direction: "right",
  text: [],
  ...overrides,
});

const sample = () =>
  node("root", { x: 500, y: 300 }, [
    node("a", { direction: "right" }, [node("a1"), node("a2")]),
    node("b", { direction: "left" }, [node("b1")]),
    node("c", { direction: "right" }),
  ]);

const flat = (root: MindNodeElement) => {
  const out: MindNodeElement[] = [];
  MindUtil.dfs(root, { before: n => void out.push(n) });
  return out;
};

const overlaps = (p: MindNodeElement, q: MindNodeElement) =>
  p.x < q.x + q.width && q.x < p.x + p.width && p.y < q.y + q.height && q.y < p.y + p.height;

describe("导图布局", () => {
  it("切到单向布局再切回思维导图，左右分配和坐标都恢复原样", () => {
    // 单向布局只读不写 direction；否则切一次布局就丢掉用户排好的左右两侧
    const original = MindUtil.layout(sample());
    const roundTrip = ["logic", "org", "tree", "mind"].reduce(
      (root, layout) => MindUtil.layout({ ...root, layout }),
      original
    );
    expect(flat(roundTrip).map(n => [n.id, n.direction, n.x, n.y])).toEqual(
      flat({ ...original, layout: "mind" }).map(n => [n.id, n.direction, n.x, n.y])
    );
  });

  it.each(["mind", "logic", "org", "tree"])("%s 布局下节点互不重叠、根节点位置不动", layout => {
    const root = MindUtil.layout({ ...sample(), layout });
    const nodes = flat(root);
    expect(root).toMatchObject({ x: 500, y: 300 });
    for (const [i, p] of nodes.entries())
      for (const q of nodes.slice(i + 1)) expect(overlaps(p, q), `${p.id} × ${q.id}`).toBe(false);
  });

  it("单向布局下收起根节点后，两侧子节点都隐藏，再次切换即全部展开", () => {
    const root = MindUtil.layout({ ...sample(), layout: "logic" });
    const folded = MindUtil.toggleFold(root, root, "right");
    expect(MindUtil.visibleChildren(folded)).toEqual([]);
    const unfolded = MindUtil.toggleFold(folded, folded, "right");
    expect(MindUtil.visibleChildren(unfolded).map(n => n.id)).toEqual(["a", "b", "c"]);
  });

  it.each(["fishbone-v9", "__proto__", "constructor", "toString"])(
    "未登记布局 %s 按思维导图排布",
    layout => {
      const unknown = MindUtil.layout({ ...sample(), layout });
      const mind = MindUtil.layout({ ...sample(), layout: "mind" });
      expect(flat(unknown).map(n => [n.x, n.y])).toEqual(flat(mind).map(n => [n.x, n.y]));
    }
  );
});
