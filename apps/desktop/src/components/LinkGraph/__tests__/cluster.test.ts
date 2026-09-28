/**
 * 主题簇的语义层：标签、桥接、孤立、颜色稳定性。
 * Louvain 本身的正确性在 louvain.test.ts。
 */

import { describe, expect, it } from "vitest";
import type { ICard } from "@/types";
import { detectClusters, MIN_CLUSTER_SIZE } from "../core/cluster";
import { clusterForce } from "../core/clusterForce";
import { buildScene } from "../core/graph";
import { clusterColor } from "../core/palette";
import type { GraphScene } from "../core/types";

const links = (c: ICard) => c.links;

const card = (id: number, linkIds: number[], tags: string[] = [], text = `卡片${id}`): ICard =>
  ({
    id,
    links: linkIds,
    tags,
    content: [{ type: "paragraph", children: [{ type: "formatted", text }] }],
    create_time: id,
  }) as unknown as ICard;

/** k 个团，团内全连，团间一条桥；每团带自己的 tag */
function topicCards(k: number, size: number, extraTags = true) {
  const cards: ICard[] = [];
  for (let c = 0; c < k; c++) {
    const base = c * size + 1;
    for (let i = 0; i < size; i++) {
      const id = base + i;
      const linkIds: number[] = [];
      for (let j = 0; j < size; j++) if (j !== i) linkIds.push(base + j);
      if (i === 0 && c > 0) linkIds.push(base - size);
      cards.push(card(id, linkIds, extraTags ? [`主题${c}`] : []));
    }
  }
  return cards;
}

describe("detectClusters", () => {
  it("每个团一个簇，成员齐全", () => {
    const cards = topicCards(4, 6);
    const scene = buildScene(cards, links);
    const result = detectClusters(scene, cards);
    expect(result.clusters).toHaveLength(4);
    expect(result.clusters.reduce((sum, c) => sum + c.members.length, 0)).toBe(24);
    expect(result.modularity).toBeGreaterThan(0.4);
  });

  it("标签取簇内高区分度的 tag", () => {
    const cards = topicCards(3, 5);
    const scene = buildScene(cards, links);
    const result = detectClusters(scene, cards);
    for (const cluster of result.clusters) {
      expect(cluster.label).toMatch(/^主题\d$/);
    }
  });

  it("所有簇共有的 tag 没有区分度，不该被选中", () => {
    // 每张卡都有「笔记」，另各有自己的主题 tag
    const cards = topicCards(3, 5).map(c => ({ ...c, tags: ["笔记", ...c.tags] }));
    const scene = buildScene(cards, links);
    const result = detectClusters(scene, cards);
    for (const cluster of result.clusters) expect(cluster.label).not.toContain("笔记");
  });

  it("只有一个簇时 tag 没有区分度，标签退化为代表卡片正文", () => {
    const cards = topicCards(1, 8);
    const scene = buildScene(cards, links);
    const result = detectClusters(scene, cards);
    expect(result.clusters).toHaveLength(1);
    expect(result.clusters[0].label).toMatch(/^卡片\d+$/);
  });

  it("没有 tag 时退化为代表卡片的正文首句", () => {
    const cards = topicCards(2, 5, false);
    const scene = buildScene(cards, links);
    const result = detectClusters(scene, cards);
    for (const cluster of result.clusters) expect(cluster.label).toMatch(/^卡片\d+$/);
  });

  it("成员按度数降序，第一个是代表卡片", () => {
    const cards = [
      card(1, [2, 3, 4]),
      card(2, [1]),
      card(3, [1]),
      card(4, [1]),
      card(5, [6, 7, 8]),
      card(6, [5]),
      card(7, [5]),
      card(8, [5, 1]),
    ];
    const scene = buildScene(cards, links);
    const result = detectClusters(scene, cards);
    for (const cluster of result.clusters) {
      const degrees = cluster.members.map(id => scene.nodeById.get(id)!.degree);
      expect([...degrees].sort((a, b) => b - a)).toEqual(degrees);
    }
  });

  it("识别桥接卡片：连到别的簇的那张", () => {
    const cards = topicCards(3, 6);
    const scene = buildScene(cards, links);
    const result = detectClusters(scene, cards);
    const allBridges = result.clusters.flatMap(c => c.bridges);
    expect(allBridges.length).toBeGreaterThan(0);
    // 桥接卡片确实有跨簇邻居
    for (const id of allBridges) {
      const own = result.clusterOf.get(id);
      const foreign = [...(scene.adjacency.get(id) ?? [])].some(
        n => result.clusterOf.get(n) !== undefined && result.clusterOf.get(n) !== own
      );
      expect(foreign).toBe(true);
    }
  });

  it("没有链接的卡片进 isolated，不进任何簇", () => {
    const cards = [...topicCards(2, 5), card(100, []), card(101, [])];
    const scene = buildScene(cards, links);
    const result = detectClusters(scene, cards);
    expect(result.isolated.sort()).toEqual([100, 101]);
    expect(result.clusterOf.has(100)).toBe(false);
  });

  it("太小的社区不单独成簇，归入 scattered", () => {
    // 一对互连的卡片（规模 2 < MIN_CLUSTER_SIZE）
    const cards = [...topicCards(2, 6), card(200, [201]), card(201, [200])];
    const scene = buildScene(cards, links);
    const result = detectClusters(scene, cards);
    expect(MIN_CLUSTER_SIZE).toBeGreaterThan(2);
    expect(result.scattered).toContain(200);
    expect(result.clusterOf.has(200)).toBe(false);
  });

  it("簇按规模降序，id 连续从 0 开始", () => {
    const cards = [
      ...topicCards(1, 10),
      ...topicCards(1, 4).map(c => ({ ...c, id: c.id + 100, links: c.links.map(l => l + 100) })),
    ];
    const scene = buildScene(cards, links);
    const result = detectClusters(scene, cards);
    const sizes = result.clusters.map(c => c.members.length);
    expect([...sizes].sort((a, b) => b - a)).toEqual(sizes);
    expect(result.clusters.map(c => c.id)).toEqual(result.clusters.map((_, i) => i));
  });

  it("空卡片集返回空结果", () => {
    const scene = buildScene([], links);
    const result = detectClusters(scene, []);
    expect(result.clusters).toHaveLength(0);
    expect(result.modularity).toBe(0);
  });

  it("buildScene 会把簇回填到节点上", () => {
    const cards = topicCards(3, 6);
    const scene = buildScene(cards, links);
    expect(scene.clusters.length).toBe(3);
    const assigned = scene.nodes.filter(n => n.cluster >= 0);
    expect(assigned).toHaveLength(18);
  });

  it("锚点是簇内最小 id：卡片增删不改变已有簇的颜色", () => {
    const before = buildScene(topicCards(3, 6), links);
    // 再加一个新主题（新 id 段），已有簇的锚点不应变化
    const extra = topicCards(1, 5).map(c => ({
      ...c,
      id: c.id + 500,
      links: c.links.map(l => l + 500),
    }));
    const after = buildScene([...topicCards(3, 6), ...extra], links);

    const anchorsBefore = new Set(before.clusters.map(c => c.anchor));
    const anchorsAfter = new Set(after.clusters.map(c => c.anchor));
    for (const anchor of anchorsBefore) expect(anchorsAfter.has(anchor)).toBe(true);
    // 同一锚点在同一底色下取到同一个颜色
    for (const anchor of anchorsBefore) {
      expect(clusterColor(anchor, "#f3eee2")).toBe(clusterColor(anchor, "#f3eee2"));
    }
  });
});

describe("clusterForce", () => {
  const sceneWithClusters = (): GraphScene => buildScene(topicCards(3, 8), links);

  const runForce = (scene: GraphScene, ticks: number) => {
    const force = clusterForce(scene.clusters.length);
    force.initialize(scene.nodes);
    for (let i = 0; i < ticks; i++) {
      force(0.3);
      for (const node of scene.nodes) {
        node.x += node.vx;
        node.y += node.vy;
        node.vx *= 0.6;
        node.vy *= 0.6;
      }
    }
  };

  const spread = (scene: GraphScene, cluster: number) => {
    const members = scene.nodes.filter(n => n.cluster === cluster);
    const cx = members.reduce((s, n) => s + n.x, 0) / members.length;
    const cy = members.reduce((s, n) => s + n.y, 0) / members.length;
    return Math.max(...members.map(n => Math.hypot(n.x - cx, n.y - cy)));
  };

  it("内聚把成员收向本簇质心", () => {
    const scene = sceneWithClusters();
    // 先人为打散
    scene.nodes.forEach((node, i) => {
      node.x = (i % 7) * 300;
      node.y = Math.floor(i / 7) * 300;
    });
    const before = spread(scene, 0);
    runForce(scene, 60);
    expect(spread(scene, 0)).toBeLessThan(before);
  });

  it("互斥把两簇质心推到安全距离之外", () => {
    const scene = sceneWithClusters();
    // 两簇质心重合的极端情形
    scene.nodes.forEach(node => {
      node.x = 0;
      node.y = 0;
    });
    runForce(scene, 200);
    const centroid = (cluster: number) => {
      const members = scene.nodes.filter(n => n.cluster === cluster);
      return {
        x: members.reduce((s, n) => s + n.x, 0) / members.length,
        y: members.reduce((s, n) => s + n.y, 0) / members.length,
      };
    };
    const a = centroid(0);
    const b = centroid(1);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(50);
  });

  it("不属于任何簇的节点不受簇力影响", () => {
    const cards = [...topicCards(2, 6), card(900, [])];
    const scene = buildScene(cards, links);
    const loose = scene.nodeById.get(900)!;
    loose.x = 1000;
    loose.y = 1000;
    runForce(scene, 40);
    expect(loose.x).toBe(1000);
    expect(loose.y).toBe(1000);
  });

  it("没有簇时是空操作，不抛错", () => {
    const force = clusterForce(0);
    force.initialize([]);
    expect(() => force(0.3)).not.toThrow();
  });

  it("坐标不产生 NaN", () => {
    const scene = sceneWithClusters();
    runForce(scene, 100);
    for (const node of scene.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
  });

  it("100 个簇 × 2000 节点，单帧在 20ms 内（簇对是 O(簇²)，节点只走一遍）", () => {
    const cards: ICard[] = [];
    for (let c = 0; c < 100; c++) {
      const base = c * 20 + 1;
      for (let i = 0; i < 20; i++) {
        const linkIds = i === 0 ? [] : [base];
        cards.push(card(base + i, linkIds, [`主题${c}`]));
      }
    }
    const scene = buildScene(cards, links);
    const force = clusterForce(scene.clusters.length);
    force.initialize(scene.nodes);
    const start = performance.now();
    for (let i = 0; i < 10; i++) force(0.3);
    expect((performance.now() - start) / 10).toBeLessThan(20);
  });
});
