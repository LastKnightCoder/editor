import { describe, expect, it } from "vitest";

import type { MindNodeElement } from "../../../types";
import MindUtil from "../../MindUtil";
import { markdownLineToText } from "../../mind-markdown";
import { resolveRange } from "../tree-shape";

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

it.each(
  ["mind", "logic", "org", "tree"].flatMap(layout =>
    (["left", "right"] as const).map(direction => ({ layout, direction }))
  )
)(
  "$layout $direction 包含、交叠和相邻范围的概要及其子树不会遮住其他正文",
  ({ layout, direction }) => {
    // 同心但不同端点的概要曾完全重叠；长正文和概要子树也必须参与避让。
    let root = MindUtil.layout(
      node(
        "root",
        { layout },
        ["a", "b", "c", "d"].map(id => node(id, { direction }))
      )
    );
    for (const ids of [["a", "b", "c"], ["b"], ["b", "c", "d"], ["d"]]) {
      const added = MindUtil.addSummary(root, ids, markdownLineToText("分组总结"))!;
      root = MindUtil.layout({
        ...added.root,
        children: added.root.children.map(child =>
          child.id === added.summaryId
            ? {
                ...child,
                width: 140,
                height: 160,
                children: [node(`child-${added.summaryId}`, { width: 180, height: 90 })],
              }
            : child
        ),
      });
      if (ids.length === 3)
        root = MindUtil.addSummary(
          root,
          [`child-${added.summaryId}`],
          markdownLineToText("子分组")
        )!.root;
    }
    const all = flat(root);
    for (const [i, current] of all.entries())
      for (const other of all.slice(i + 1))
        expect(overlaps(current, other), `${layout}: ${current.id}/${other.id}`).toBe(false);
    const again = MindUtil.layout(root);
    expect(flat(again).map(n => [n.id, n.x, n.y])).toEqual(all.map(n => [n.id, n.x, n.y]));
  }
);

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

describe("概要与外框区间", () => {
  const ranged = () =>
    MindUtil.layout(
      node("root", { x: 500, y: 300 }, [
        node("a"),
        node("b"),
        node("c"),
        node("d"),
        node("s", { summaryRange: { startId: "a", endId: "c" } }),
      ])
    );
  const withBoundary = (root: MindNodeElement) => MindUtil.addBoundary(root, ["b", "c"])!.root;
  const find = (root: MindNodeElement, id: string) => MindUtil.findNodeInTree(root, id)!;

  it("删掉区间端点时收缩到剩下的连续兄弟", () => {
    const root = withBoundary(ranged());
    const next = MindUtil.deleteNodes(root, [find(root, "a"), find(root, "c")]);
    expect(find(next, "s").summaryRange).toEqual({ startId: "b", endId: "b" });
    expect(next.boundaries).toMatchObject([{ startId: "b", endId: "b" }]);
  });

  it("括住的兄弟全删光时外框移除、概要节点随之删除", () => {
    const root = withBoundary(ranged());
    const next = MindUtil.deleteNodes(
      root,
      ["a", "b", "c"].map(id => find(root, id))
    );
    expect(next.children.map(child => child.id)).toEqual(["d"]);
    expect(next.boundaries).toBeUndefined();
  });

  it("端点在别处失效（并发删除）时布局退化为另一端，两端都失效则概要变回普通子节点", () => {
    const root = ranged();
    const oneGone = MindUtil.layout({
      ...root,
      children: root.children.filter(child => child.id !== "c"),
    });
    expect(find(oneGone, "s").summaryRange).toEqual({ startId: "a", endId: "a" });
    const allGone = MindUtil.layout({
      ...root,
      children: root.children.filter(child => !["a", "c"].includes(child.id)),
    });
    expect(find(allGone, "s").summaryRange).toBeUndefined();
  });

  it("只有同一父节点下同侧连续的兄弟才能加概要", () => {
    const root = MindUtil.layout(sample());
    expect(MindUtil.adjacentSiblings(root, ["a", "c"])).not.toBeNull();
    expect(MindUtil.adjacentSiblings(root, ["a", "b"])).toBeNull();
    expect(MindUtil.adjacentSiblings(root, ["a", "a1"])).toBeNull();
    expect(MindUtil.adjacentSiblings(root, ["root"])).toBeNull();
  });

  it("复制子树时区间端点跟着换成副本的新 id", () => {
    const copy = MindUtil.cloneSubtree(withBoundary(ranged()));
    const ids = new Set(flat(copy).map(n => n.id));
    const summary = copy.children.find(child => child.summaryRange)!;
    expect(ids.has(summary.summaryRange!.startId) && ids.has(summary.summaryRange!.endId)).toBe(
      true
    );
    expect(ids.has(copy.boundaries![0].startId)).toBe(true);
  });

  it.each(["mind", "logic", "org", "tree"])("%s 布局下概要节点不压住它括住的兄弟", layout => {
    const root = MindUtil.layout({ ...withBoundary(ranged()), layout });
    const nodes = flat(root);
    nodes.forEach((p, i) => nodes.slice(i + 1).forEach(q => expect(overlaps(p, q)).toBe(false)));
  });
});

it.each(["mind", "logic", "org", "tree"])(
  "%s 对同一区间重复添加概要时保留已有正文和身份",
  layout => {
    // 重复操作曾创建两个处于完全相同坐标的概要，后一个挡住已有正文。
    const root = MindUtil.layout(node("root", { layout }, [node("a"), node("b")]));
    const first = MindUtil.addSummary(root, ["a", "b"], markdownLineToText("已编辑的总结"))!;
    const second = MindUtil.addSummary(first.root, ["b", "a"], markdownLineToText("概要"))!;
    expect(second.summaryId).toBe(first.summaryId);
    expect(flat(second.root).map(n => [n.id, n.text])).toEqual(
      flat(first.root).map(n => [n.id, n.text])
    );
  }
);

it("多选兄弟一起粘贴时概要引用同批副本，而不是原节点", () => {
  const source = node("source", {}, [node("a"), node("b")]);
  const summary = MindUtil.addSummary(
    MindUtil.layout(source),
    ["a", "b"],
    markdownLineToText("总结")
  )!;
  const result = MindUtil.attachSubtrees(node("target"), "target", summary.root.children)!;
  const [a, b, copiedSummary] = result.root.children;
  expect(copiedSummary.summaryRange).toEqual({ startId: a.id, endId: b.id });
  expect([a.id, b.id]).not.toContain("a");
  expect([a.id, b.id]).not.toContain("b");
});

it.each([
  { range: { startId: "a", endId: "c" }, bothSides: true, expected: ["a", "c"] },
  { range: { startId: "c", endId: "a" }, bothSides: false, expected: ["a", "b", "c"] },
  { range: { startId: "missing", endId: "c" }, bothSides: true, expected: ["c"] },
  { range: { startId: "a", endId: "b" }, bothSides: true, expected: ["a"] },
  { range: { startId: "missing", endId: "gone" }, bothSides: false, expected: [] },
])("范围按同侧、端点顺序和缺失端点规则解析：$range", ({ range, bothSides, expected }) => {
  const siblings = [node("a"), node("b", { direction: "left" }), node("c")];
  expect(resolveRange(siblings, range, bothSides).map(child => child.id)).toEqual(expected);
});
