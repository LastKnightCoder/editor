/**
 * 布局行为与规模。
 *
 * 规模断言用宽松上界（CI 机器性能差异大），目的是拦住数量级退化——
 * 比如误把 O(n²) 的力写进每帧，或者忘了给 manyBody 设 distanceMax。
 */

import { describe, expect, it } from "vitest";
import type { ICard } from "@/types";
import { buildScene, sceneBounds } from "../core/graph";
import { ForceLayout } from "../core/layout";

const links = (c: ICard) => c.links;

/** 造一片有簇结构的卡片：每 20 张连成一小团，团与团之间偶尔搭一条桥 */
const makeCards = (count: number): ICard[] =>
  Array.from({ length: count }, (_, i) => {
    const id = i + 1;
    const inCluster = i % 20;
    const target: number[] = [];
    if (inCluster !== 0) target.push(id - 1);
    if (inCluster === 0 && id > 20) target.push(id - 20);
    return { id, links: target, content: [], create_time: id, tags: [] } as unknown as ICard;
  });

describe("ForceLayout", () => {
  it("收敛后节点散开，不再全挤在种子位", () => {
    const scene = buildScene(makeCards(60), links);
    const before = sceneBounds(scene);
    const layout = new ForceLayout(scene);
    layout.runToSettle(200);
    const after = sceneBounds(scene);
    expect(after.maxX - after.minX).not.toBeCloseTo(before.maxX - before.minX, 0);
    expect(layout.isSettled).toBe(true);
    layout.destroy();
  });

  it("收敛后不产生 NaN 坐标", () => {
    const scene = buildScene(makeCards(120), links);
    const layout = new ForceLayout(scene);
    layout.runToSettle(200);
    for (const node of scene.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
    layout.destroy();
  });

  it("相连节点比不相连的更近（连线的吸引力真的生效）", () => {
    const scene = buildScene(makeCards(200), links);
    const layout = new ForceLayout(scene);
    layout.runToSettle(300);
    const distance = (a: number, b: number) => {
      const na = scene.nodeById.get(a)!;
      const nb = scene.nodeById.get(b)!;
      return Math.hypot(na.x - nb.x, na.y - nb.y);
    };
    // 2 与 3 同簇相邻；2 与 150 分属不同簇
    expect(distance(2, 3)).toBeLessThan(distance(2, 150));
    layout.destroy();
  });

  it("拖拽固定节点，松手保留位置", () => {
    const scene = buildScene(makeCards(20), links);
    const layout = new ForceLayout(scene);
    const node = scene.nodes[0];
    layout.dragTo(node, 1234, 5678);
    expect([node.x, node.fx]).toEqual([1234, 1234]);
    layout.endDrag(node, true);
    layout.stop();
    expect(node.fx).toBe(1234);

    layout.endDrag(node, false);
    expect(node.fx).toBeNull();
    layout.destroy();
  });

  it("700 张卡片（当前真实量级）的建图 + 收敛在 3 秒内", () => {
    const cards = makeCards(700);
    const start = performance.now();
    const scene = buildScene(cards, links);
    const layout = new ForceLayout(scene);
    layout.runToSettle(300);
    const elapsed = performance.now() - start;
    layout.destroy();
    expect(scene.nodes).toHaveLength(700);
    expect(elapsed).toBeLessThan(3000);
  });

  it("2000 张卡片（M 档上界）的建图在 300ms 内", () => {
    const cards = makeCards(2000);
    const start = performance.now();
    const scene = buildScene(cards, links);
    const elapsed = performance.now() - start;
    expect(scene.nodes).toHaveLength(2000);
    expect(elapsed).toBeLessThan(300);
  });
});
