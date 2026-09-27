import { describe, expect, it } from "vitest";
import { buildCompactGraph, louvain, modularityOf } from "../core/louvain";

/** 造 k 个团，每个团 size 个节点内部全连，团与团之间只有一条桥 */
const cliques = (k: number, size: number) => {
  const edges: Array<{ source: number; target: number }> = [];
  for (let c = 0; c < k; c++) {
    const base = c * size;
    for (let i = 0; i < size; i++) {
      for (let j = i + 1; j < size; j++) edges.push({ source: base + i, target: base + j });
    }
    if (c > 0) edges.push({ source: base, target: base - size });
  }
  return buildCompactGraph(k * size, edges);
};

describe("buildCompactGraph", () => {
  it("CSR 偏移与邻居正确，度数含自环 ×2", () => {
    const graph = buildCompactGraph(3, [
      { source: 0, target: 1 },
      { source: 1, target: 2 },
      { source: 2, target: 2, weight: 3 },
    ]);
    expect([...graph.offsets]).toEqual([0, 1, 3, 4]);
    expect(graph.degrees[1]).toBe(2);
    expect(graph.degrees[2]).toBe(1 + 6);
    expect(graph.totalWeight).toBe(5);
  });

  it("空图与无边图不炸", () => {
    expect(buildCompactGraph(0, []).count).toBe(0);
    const isolated = buildCompactGraph(3, []);
    expect(isolated.totalWeight).toBe(0);
    expect([...isolated.degrees]).toEqual([0, 0, 0]);
  });
});

describe("louvain", () => {
  it("把每个团划成一个社区", () => {
    const result = louvain(cliques(4, 6));
    expect(result.communityCount).toBe(4);
    // 同团同社区
    for (let c = 0; c < 4; c++) {
      const base = c * 6;
      const own = result.membership[base];
      for (let i = 1; i < 6; i++) expect(result.membership[base + i]).toBe(own);
    }
    // 不同团不同社区
    const owners = new Set([0, 1, 2, 3].map(c => result.membership[c * 6]));
    expect(owners.size).toBe(4);
  });

  it("模块度为正且与独立计算一致", () => {
    const graph = cliques(3, 5);
    const result = louvain(graph);
    expect(result.modularity).toBeGreaterThan(0.4);
    expect(modularityOf(graph, result.membership)).toBeCloseTo(result.modularity, 10);
  });

  it("分辨率越大划分越碎", () => {
    const graph = cliques(6, 8);
    const coarse = louvain(graph, 0.4);
    const fine = louvain(graph, 3);
    expect(fine.communityCount).toBeGreaterThanOrEqual(coarse.communityCount);
  });

  it("一条链不会被切成每点一簇（否则等于没分）", () => {
    const edges = Array.from({ length: 29 }, (_, i) => ({ source: i, target: i + 1 }));
    const result = louvain(buildCompactGraph(30, edges));
    expect(result.communityCount).toBeGreaterThan(1);
    expect(result.communityCount).toBeLessThan(15);
  });

  it("完全图只有一个社区（内部没有更紧的子结构）", () => {
    const edges: Array<{ source: number; target: number }> = [];
    for (let i = 0; i < 10; i++)
      for (let j = i + 1; j < 10; j++) edges.push({ source: i, target: j });
    expect(louvain(buildCompactGraph(10, edges)).communityCount).toBe(1);
  });

  it("无边图每点自成一簇，模块度为 0", () => {
    const result = louvain(buildCompactGraph(5, []));
    expect(result.communityCount).toBe(5);
    expect(result.modularity).toBe(0);
  });

  it("空图返回空结果", () => {
    const result = louvain(buildCompactGraph(0, []));
    expect(result.communityCount).toBe(0);
    expect(result.membership.length).toBe(0);
  });

  it("membership 覆盖全部节点且编号连续", () => {
    const result = louvain(cliques(5, 4));
    expect(result.membership.length).toBe(20);
    const used = new Set(result.membership);
    expect(used.size).toBe(result.communityCount);
    expect(Math.max(...used)).toBe(result.communityCount - 1);
  });

  it("2 万节点 4 万边在 3 秒内跑完（XL 档的上界）", () => {
    const count = 20000;
    const edges: Array<{ source: number; target: number }> = [];
    for (let i = 0; i < count; i++) {
      const clusterBase = Math.floor(i / 25) * 25;
      if (i !== clusterBase) edges.push({ source: i, target: clusterBase + (i % 7) });
      if (i % 25 === 0 && i > 0) edges.push({ source: i, target: i - 25 });
    }
    const graph = buildCompactGraph(count, edges);
    const start = performance.now();
    const result = louvain(graph);
    const elapsed = performance.now() - start;
    expect(result.communityCount).toBeGreaterThan(100);
    expect(elapsed).toBeLessThan(3000);
  });
});
