/**
 * 主题簇：把 Louvain 的社区划分翻译成用户看得懂的信息。
 *
 * 社区编号本身没有意义，要给出的是三件事：
 *  1) 这个簇讲什么（标签）——tags 的 TF-IDF，退化到度数最高那张卡的正文首句；
 *  2) 哪些卡片连接了两个主题（桥接）——往往是最有价值的洞见所在；
 *  3) 哪些卡片还没有归属（孤立）——提示用户去建立链接。
 *
 * 色相不按簇序号分配而按「锚点卡片 id」哈希：序号会随卡片增删整体漂移，
 * 那样每加一张卡全图换色；锚点取簇内最小 id，只要簇还在颜色就稳定。
 */

import { buildCompactGraph, louvain } from "./louvain";
import type { GraphScene } from "./types";

/** 簇内 tags 取前几个做标签 */
const LABEL_TAG_COUNT = 2;
/** 小于这个规模的簇不单独成簇（画出来只是噪点），归入「零散」 */
export const MIN_CLUSTER_SIZE = 3;

export interface ClusterInfo {
  id: number;
  /** 成员卡片 id，按度数降序（第一个是簇的代表卡片） */
  members: number[];
  label: string;
  /** 色相分配用的稳定锚点（簇内最小 id） */
  anchor: number;
  /** 连到其他簇的卡片 id（按连出的簇数降序） */
  bridges: number[];
}

export interface ClusterResult {
  clusters: ClusterInfo[];
  /** 卡片 id → 簇 id；不在任何簇里（孤立/零散）的不在表中 */
  clusterOf: Map<number, number>;
  /** 没有任何链接的卡片 */
  isolated: number[];
  /** 有链接但所在社区太小，未单独成簇 */
  scattered: number[];
  modularity: number;
}

const EMPTY: ClusterResult = {
  clusters: [],
  clusterOf: new Map(),
  isolated: [],
  scattered: [],
  modularity: 0,
};

/** TF-IDF 选标签：簇内高频、但不是所有簇都有的 tag 才有区分度 */
function pickLabel(
  members: number[],
  tagsOf: Map<number, string[]>,
  documentFrequency: Map<string, number>,
  clusterCount: number,
  fallback: string
): string {
  const frequency = new Map<string, number>();
  for (const id of members) {
    for (const tag of new Set(tagsOf.get(id) ?? [])) {
      frequency.set(tag, (frequency.get(tag) ?? 0) + 1);
    }
  }
  if (frequency.size === 0) return fallback;

  const scored = [...frequency.entries()]
    .map(([tag, count]) => {
      const df = documentFrequency.get(tag) ?? 1;
      // 经典 IDF（不加平滑）：每个簇都有的 tag 得分恰好为 0，随后被过滤掉。
      // 加了平滑它就还有正分，「笔记」这类通用标签会挤进每个簇的标签里。
      return { tag, score: (count / members.length) * Math.log(clusterCount / df) };
    })
    // 分数相同时按 tag 字典序，保证结果稳定可复现
    .sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag));

  const picked = scored.filter(item => item.score > 0).slice(0, LABEL_TAG_COUNT);
  if (picked.length === 0) return fallback;
  return picked.map(item => item.tag).join(" · ");
}

export function detectClusters(
  scene: GraphScene,
  items: Array<{ id: number; tags?: string[] }>,
  resolution = 1
): ClusterResult {
  if (scene.nodes.length === 0) return EMPTY;

  const indexOf = new Map<number, number>();
  scene.nodes.forEach((node, index) => indexOf.set(node.id, index));
  const graph = buildCompactGraph(
    scene.nodes.length,
    scene.edges.map(edge => ({
      source: indexOf.get(edge.source)!,
      target: indexOf.get(edge.target)!,
    }))
  );
  const { membership, modularity } = louvain(graph, resolution);

  // 按社区归拢；孤立节点（度 0）直接摘出去，它们在 Louvain 里各自成簇没有意义
  const grouped = new Map<number, number[]>();
  const isolated: number[] = [];
  scene.nodes.forEach((node, index) => {
    if (node.degree === 0) {
      isolated.push(node.id);
      return;
    }
    const community = membership[index];
    const bucket = grouped.get(community);
    if (bucket) bucket.push(node.id);
    else grouped.set(community, [node.id]);
  });

  const scattered: number[] = [];
  const kept: number[][] = [];
  for (const members of grouped.values()) {
    if (members.length < MIN_CLUSTER_SIZE) scattered.push(...members);
    else kept.push(members);
  }

  // 规模降序，同规模按锚点 id：顺序稳定，渲染层的绘制次序也就稳定
  kept.sort((a, b) => b.length - a.length || Math.min(...a) - Math.min(...b));

  const clusterOf = new Map<number, number>();
  kept.forEach((members, id) => {
    for (const cardId of members) clusterOf.set(cardId, id);
  });

  const tagsOf = new Map(items.map(item => [item.id, item.tags ?? []]));
  const documentFrequency = new Map<string, number>();
  for (const members of kept) {
    const seen = new Set<string>();
    for (const id of members) for (const tag of tagsOf.get(id) ?? []) seen.add(tag);
    for (const tag of seen) documentFrequency.set(tag, (documentFrequency.get(tag) ?? 0) + 1);
  }

  const clusters: ClusterInfo[] = kept.map((members, id) => {
    const byDegree = [...members].sort((a, b) => {
      const left = scene.nodeById.get(a)!;
      const right = scene.nodeById.get(b)!;
      return right.degree - left.degree || left.id - right.id;
    });

    // 桥接：连到其他簇的卡片，按连出的簇数排序（跨得越多越关键）
    const bridges = byDegree
      .map(cardId => {
        const foreign = new Set<number>();
        for (const neighbor of scene.adjacency.get(cardId) ?? []) {
          const other = clusterOf.get(neighbor);
          if (other !== undefined && other !== id) foreign.add(other);
        }
        return { cardId, reach: foreign.size };
      })
      .filter(item => item.reach > 0)
      .sort((a, b) => b.reach - a.reach || a.cardId - b.cardId)
      .map(item => item.cardId);

    const representative = scene.nodeById.get(byDegree[0])!;
    return {
      id,
      members: byDegree,
      anchor: Math.min(...members),
      label: pickLabel(
        members,
        tagsOf,
        documentFrequency,
        kept.length,
        representative.label || `${members.length} 张卡片`
      ),
      bridges,
    };
  });

  return { clusters, clusterOf, isolated, scattered, modularity };
}
