import { describe, expect, it } from "vitest";
import type { ICard } from "@/types";
import { toItems } from "./fixtures";
import { buildScene, inheritPositions, nodeRadius, sceneBounds } from "../core/graph";

const card = (id: number, links: number[] = [], content?: unknown): ICard =>
  ({
    id,
    links,
    content: content ?? [
      { type: "paragraph", children: [{ type: "formatted", text: `卡片${id}` }] },
    ],
    create_time: id * 1000,
    tags: [],
  }) as unknown as ICard;

describe("buildScene", () => {
  it("成边去重、去自环、去悬空链接", () => {
    const scene = buildScene(toItems([card(1, [2, 2, 1, 99]), card(2, [1])]));
    expect(scene.edges).toEqual([{ source: 1, target: 2 }]);
    expect(scene.nodeById.get(1)!.degree).toBe(1);
  });

  it("度数决定半径，按 sqrt 增长而非线性", () => {
    expect(nodeRadius(0)).toBeLessThan(nodeRadius(1));
    // 度数翻 4 倍，半径增量只翻 2 倍
    const d1 = nodeRadius(1) - nodeRadius(0);
    const d4 = nodeRadius(4) - nodeRadius(0);
    expect(d4 / d1).toBeCloseTo(2, 1);
  });

  it("标签取正文首段文本并压缩空白", () => {
    const scene = buildScene(
      toItems([
        card(1, [], [{ type: "paragraph", children: [{ type: "formatted", text: "  上  下  " }] }]),
      ])
    );
    expect(scene.nodeById.get(1)!.label).toBe("上 下");
  });

  it("空正文不炸，标签为空串", () => {
    const scene = buildScene(toItems([card(1, [], [])]));
    expect(scene.nodeById.get(1)!.label).toBe("");
  });

  it("不同连通分量的初始位置不重叠", () => {
    // 两个各 5 节点的链，互不相连
    const chain = (base: number) =>
      [0, 1, 2, 3, 4].map(i => card(base + i, i < 4 ? [base + i + 1] : []));
    const scene = buildScene(toItems([...chain(1), ...chain(11)]));
    const first = [1, 2, 3, 4, 5].map(id => scene.nodeById.get(id)!);
    const second = [11, 12, 13, 14, 15].map(id => scene.nodeById.get(id)!);
    const centroid = (nodes: typeof first) => ({
      x: nodes.reduce((s, n) => s + n.x, 0) / nodes.length,
      y: nodes.reduce((s, n) => s + n.y, 0) / nodes.length,
    });
    const a = centroid(first);
    const b = centroid(second);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(100);
  });

  it("同一分量内的节点互不重合", () => {
    const scene = buildScene(
      toItems(Array.from({ length: 20 }, (_, i) => card(i + 1, i < 19 ? [i + 2] : [])))
    );
    const seen = new Set(scene.nodes.map(n => `${n.x.toFixed(3)},${n.y.toFixed(3)}`));
    expect(seen.size).toBe(scene.nodes.length);
  });
});

describe("inheritPositions", () => {
  it("已有节点保留坐标与固定状态", () => {
    const previous = buildScene(toItems([card(1, [2]), card(2, [1])]));
    previous.nodeById.get(1)!.x = 123;
    previous.nodeById.get(1)!.y = 456;
    previous.nodeById.get(1)!.fx = 123;
    previous.nodeById.get(1)!.fy = 456;

    const next = inheritPositions(
      buildScene(toItems([card(1, [2]), card(2, [1]), card(3, [1])])),
      previous
    );
    expect(next.nodeById.get(1)!.x).toBe(123);
    expect(next.nodeById.get(1)!.fx).toBe(123);
  });

  it("新增节点落在已有邻居附近，而不是螺旋种子位", () => {
    const previous = buildScene(toItems([card(1)]));
    previous.nodeById.get(1)!.x = 1000;
    previous.nodeById.get(1)!.y = 1000;

    const next = inheritPositions(buildScene(toItems([card(1), card(2, [1])])), previous);
    const fresh = next.nodeById.get(2)!;
    expect(Math.hypot(fresh.x - 1000, fresh.y - 1000)).toBeLessThan(60);
  });

  it("新增的孤立节点不继承任何坐标", () => {
    const previous = buildScene(toItems([card(1)]));
    previous.nodeById.get(1)!.x = 1000;
    const next = inheritPositions(buildScene(toItems([card(1), card(2)])), previous);
    expect(next.nodeById.get(2)!.x).not.toBe(1000);
  });
});

describe("sceneBounds", () => {
  it("包围盒包含节点半径", () => {
    const scene = buildScene(toItems([card(1)]));
    const node = scene.nodeById.get(1)!;
    node.x = 0;
    node.y = 0;
    const bounds = sceneBounds(scene);
    expect(bounds.minX).toBe(-node.radius);
    expect(bounds.maxY).toBe(node.radius);
  });

  it("空图返回非退化的盒，避免 fit 时除零", () => {
    const bounds = sceneBounds(buildScene(toItems([])));
    expect(bounds.maxX - bounds.minX).toBeGreaterThan(0);
  });
});
