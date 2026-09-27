/**
 * 知识地图离线计算：显式链接 + 语义近邻 → 两层主题 → 命名 → 分层布局。
 *
 * 为什么不再只靠链接：大多数卡片没有链接，只按链接分簇时它们全是外圈的孤点，
 * 有链接的又被切成一堆两三张的小簇（每个小簇一个名字一个颜色，于是满屏碎标签、
 * 五颜六色）。语义近邻把每张卡都接进图里，主题才会是「几块大区域」。
 *
 * 语义边只决定「谁挨着谁、谁属于哪个主题」，渲染时不画——画出来的线仍只有用户
 * 亲手建的链接，那是用户的意图，不能和算法推测混在一起。
 *
 * 本文件是纯函数（无 DOM、无 Electron、无 IO），主进程 worker 与单测共用。
 */

import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { buildCompactGraph, louvain } from "@/components/LinkGraph/core/louvain";
import { subtopicLabel, tagPath, topicLabel, type LabelMember } from "./labels";
import {
  TOPIC_PALETTE_SIZE,
  type KnowledgeMap,
  type KnowledgeMapCardInput,
  type KnowledgeMapNode,
  type KnowledgeMapTopic,
} from "./types";
import { knn, type CardVector } from "./vectors";

export interface ComputeOptions {
  /** 每张卡取几个语义近邻 */
  neighbors?: number;
  /** 余弦相似度低于它不算近邻 */
  minSimilarity?: number;
  /** 布局迭代次数（测试可调小） */
  ticks?: number;
  now?: number;
}

/** 显式链接的权重：用户亲手连的，比算法推测的语义相似更可信 */
const LINK_WEIGHT = 1.5;
/** 大主题数量的目标区间：少于 6 个信息量不够，多于 12 个颜色就区分不开 */
const TOPIC_TARGET = { min: 6, max: 12, ideal: 9 };
const RESOLUTIONS = [0.15, 0.25, 0.35, 0.5, 0.7, 1, 1.4];

/** 地图上的节点半径（世界坐标）：比链接图谱小一档，语义岛屿是密的 */
export function mapNodeRadius(degree: number): number {
  return 3.5 + Math.sqrt(degree) * 1.6;
}

/* ───────── 加权图 ───────── */

interface WeightedGraph {
  count: number;
  edges: Array<{ source: number; target: number; weight: number; explicit: boolean }>;
  /** 每个下标的加权邻接，合并阶段按边权找「最亲近」的主题用 */
  adjacency: Array<Map<number, number>>;
  /** 显式链接的度数（节点大小只按用户亲手建的链接算） */
  linkDegree: Int32Array;
}

function buildWeightedGraph(
  cards: KnowledgeMapCardInput[],
  vectors: CardVector[],
  options: Required<Pick<ComputeOptions, "neighbors" | "minSimilarity">>
): WeightedGraph {
  const indexOf = new Map(cards.map((card, index) => [card.id, index]));
  const adjacency = cards.map(() => new Map<number, number>());
  const explicitPairs = new Set<string>();
  const linkDegree = new Int32Array(cards.length);
  const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

  const addWeight = (a: number, b: number, weight: number) => {
    adjacency[a].set(b, (adjacency[a].get(b) ?? 0) + weight);
    adjacency[b].set(a, (adjacency[b].get(a) ?? 0) + weight);
  };

  cards.forEach((card, a) => {
    for (const targetId of new Set(card.links)) {
      const b = indexOf.get(targetId);
      if (b === undefined || b === a) continue;
      const key = pairKey(a, b);
      if (explicitPairs.has(key)) continue;
      explicitPairs.add(key);
      linkDegree[a] += 1;
      linkDegree[b] += 1;
      addWeight(a, b, LINK_WEIGHT);
    }
  });

  // 语义近邻：权重按相似度在 [minSimilarity, 1] 上线性映射到 (0, 1]
  const vectorIndex = vectors.map(v => indexOf.get(v.id));
  const neighbors = knn(vectors, options.neighbors, options.minSimilarity);
  const span = Math.max(1e-6, 1 - options.minSimilarity);
  const semanticPairs = new Set<string>();
  neighbors.forEach((list, i) => {
    const a = vectorIndex[i];
    if (a === undefined) return;
    for (const { index, similarity } of list) {
      const b = vectorIndex[index];
      if (b === undefined || b === a) continue;
      const key = pairKey(a, b);
      // kNN 不对称：A 把 B 当近邻、B 也把 A 当近邻时只记一次
      if (semanticPairs.has(key)) continue;
      semanticPairs.add(key);
      addWeight(a, b, (similarity - options.minSimilarity) / span);
    }
  });

  const edges: WeightedGraph["edges"] = [];
  adjacency.forEach((map, a) => {
    for (const [b, weight] of map) {
      if (b <= a) continue;
      edges.push({ source: a, target: b, weight, explicit: explicitPairs.has(pairKey(a, b)) });
    }
  });
  return { count: cards.length, edges, adjacency, linkDegree };
}

/* ───────── 主题划分 ───────── */

/** 下标集合在加权图上连到各「目标分组」的总权重 */
function affinity(
  members: number[],
  assignment: Int32Array,
  graph: WeightedGraph
): Map<number, number> {
  const result = new Map<number, number>();
  for (const node of members) {
    for (const [other, weight] of graph.adjacency[node]) {
      const group = assignment[other];
      if (group < 0) continue;
      result.set(group, (result.get(group) ?? 0) + weight);
    }
  }
  return result;
}

function strongest(scores: Map<number, number>, exclude: number): number {
  let best = -1;
  let bestScore = 0;
  for (const [group, score] of scores) {
    if (group === exclude) continue;
    if (score > bestScore || (score === bestScore && best !== -1 && group < best)) {
      best = group;
      bestScore = score;
    }
  }
  return best;
}

function groupsOf(assignment: Int32Array): Map<number, number[]> {
  const groups = new Map<number, number[]>();
  assignment.forEach((group, node) => {
    if (group < 0) return;
    const list = groups.get(group);
    if (list) list.push(node);
    else groups.set(group, [node]);
  });
  return groups;
}

/**
 * 把太小的分组并进最亲近的大分组；没有任何连接的留作 -1（未归类）。
 * 反复做直到稳定：一个小组并入后，别的小组可能因此找到了归宿。
 */
function absorbSmall(assignment: Int32Array, graph: WeightedGraph, minSize: number) {
  for (let round = 0; round < 5; round++) {
    let changed = false;
    const groups = groupsOf(assignment);
    const small = [...groups.entries()].filter(([, m]) => m.length < minSize);
    for (const [group, members] of small) {
      const target = strongest(affinity(members, assignment, graph), group);
      const targetSize = target >= 0 ? (groups.get(target)?.length ?? 0) : 0;
      if (target >= 0 && targetSize >= minSize) {
        for (const node of members) assignment[node] = target;
        changed = true;
      }
    }
    if (!changed) break;
  }
  for (const members of groupsOf(assignment).values()) {
    if (members.length < minSize) for (const node of members) assignment[node] = -1;
  }
}

/** 按分辨率扫描，挑大主题数最接近目标的划分 */
function detectTopics(graph: WeightedGraph): Int32Array {
  const compact = buildCompactGraph(graph.count, graph.edges);
  const minTopic = Math.max(4, Math.ceil(graph.count * 0.012));
  let best: { assignment: Int32Array; score: number } | null = null;

  for (const resolution of RESOLUTIONS) {
    const { membership } = louvain(compact, resolution);
    const assignment = Int32Array.from(membership);
    // 孤立节点（加权度 0）不属于任何主题
    for (let i = 0; i < graph.count; i++) if (graph.adjacency[i].size === 0) assignment[i] = -1;
    absorbSmall(assignment, graph, minTopic);
    const count = groupsOf(assignment).size;
    const inRange = count >= TOPIC_TARGET.min && count <= TOPIC_TARGET.max;
    const score = (inRange ? 0 : 100) + Math.abs(count - TOPIC_TARGET.ideal);
    if (!best || score < best.score) best = { assignment, score };
  }
  return best!.assignment;
}

/** 各分组的向量质心（未归一化的均值即可，比较时用余弦） */
function centroids(assignment: Int32Array, vectorOf: Array<Float32Array | undefined>) {
  const result = new Map<number, Float32Array>();
  const counts = new Map<number, number>();
  assignment.forEach((group, node) => {
    const vector = vectorOf[node];
    if (group < 0 || !vector) return;
    let sum = result.get(group);
    if (!sum) {
      sum = new Float32Array(vector.length);
      result.set(group, sum);
    }
    for (let i = 0; i < vector.length; i++) sum[i] += vector[i];
    counts.set(group, (counts.get(group) ?? 0) + 1);
  });
  return result;
}

function cosine(a: Float32Array, b: Float32Array) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na * nb) || 1);
}

/**
 * 大主题超过色槽数时，把最小的并进最亲近的主题。
 *
 * 亲近度先看图上的连接；两个主题在图上完全不连通（语义孤岛很常见）时，
 * 退到主题向量质心的余弦相似度。两样都没有（用户没配 embedding、且主题间
 * 没有任何链接）就停手——多出来的主题用中性色，也绝不为了凑颜色数丢卡片。
 */
function capTopics(
  assignment: Int32Array,
  graph: WeightedGraph,
  vectorOf: Array<Float32Array | undefined>
) {
  for (;;) {
    const groups = [...groupsOf(assignment).entries()].sort(
      (a, b) => a[1].length - b[1].length || a[0] - b[0]
    );
    if (groups.length <= TOPIC_PALETTE_SIZE) return;
    const [group, members] = groups[0];
    let target = strongest(affinity(members, assignment, graph), group);
    if (target < 0) {
      const centers = centroids(assignment, vectorOf);
      const own = centers.get(group);
      let best = -Infinity;
      if (own) {
        for (const [other, center] of centers) {
          if (other === group) continue;
          const similarity = cosine(own, center);
          if (similarity > best || (similarity === best && other < target)) {
            best = similarity;
            target = other;
          }
        }
      }
    }
    if (target < 0) return;
    for (const node of members) assignment[node] = target;
  }
}

/** 大主题名的覆盖率低于它就算「名不副实」，考虑拆开 */
const TOPIC_COHERENCE = 0.4;

/**
 * 拆开名不副实的大主题。
 *
 * 真实数据里人文类卡片（经济、概念、学习方法、随笔、读书……）在向量空间里连成一片，
 * 分出来是一个大主题，却只能取占 27% 的「经济」当名字——名字在误导人。
 * 这时按主题内部的子结构拆：各子块自己取名，同名的并起来，能成为独立大主题的
 * 就提升上去，直到用满色槽。拆不出至少两块像样的就保持原样。
 */
function splitIncoherent(
  assignment: Int32Array,
  graph: WeightedGraph,
  labelFor: (members: number[]) => string,
  headCoverage: (members: number[], label: string) => number
) {
  let nextGroup = Math.max(-1, ...assignment) + 1;
  const groups = [...groupsOf(assignment).entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0] - b[0]
  );
  let budget = TOPIC_PALETTE_SIZE - groups.length;
  const minTopic = Math.max(4, Math.ceil(graph.count * 0.012));

  for (const [, members] of groups) {
    if (budget <= 0) return;
    const label = labelFor(members);
    if (!label || members.length < minTopic * 3) continue;
    if (headCoverage(members, label) >= TOPIC_COHERENCE) continue;

    const local = detectSubtopics(members, graph);
    // 子块按名字归拢
    const byLabel = new Map<string, number[]>();
    for (const sub of groupsOf(local).values()) {
      const nodes = sub.map(i => members[i]);
      const subLabel = labelFor(nodes);
      if (!subLabel) continue;
      const list = byLabel.get(subLabel) ?? [];
      list.push(...nodes);
      byLabel.set(subLabel, list);
    }
    const candidates = [...byLabel.entries()]
      .filter(
        ([subLabel, nodes]) =>
          nodes.length >= minTopic && headCoverage(nodes, subLabel) >= TOPIC_COHERENCE
      )
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    // 最大的一块留在原主题里（它继承原来的分组 id），其余提升
    if (candidates.length < 2) continue;
    for (const [, nodes] of candidates.slice(1, 1 + budget)) {
      const group = nextGroup++;
      for (const node of nodes) assignment[node] = group;
      budget -= 1;
    }
  }
}

/** 命名后同名合并：两个都叫「JavaScript」的主题在用户眼里就是一个 */
function mergeByLabel(
  assignment: Int32Array,
  labelFor: (members: number[]) => string
): Map<number, string> {
  const groups = [...groupsOf(assignment).entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0] - b[0]
  );
  const keeperOf = new Map<string, number>();
  const labels = new Map<number, string>();
  for (const [group, members] of groups) {
    const label = labelFor(members);
    const keeper = label ? keeperOf.get(label) : undefined;
    if (keeper === undefined) {
      keeperOf.set(label, group);
      labels.set(group, label);
      continue;
    }
    for (const node of members) assignment[node] = keeper;
  }
  return labels;
}

/** 主题内部再分一层：只在子图上跑，粒度用经典分辨率 */
function detectSubtopics(topicMembers: number[], graph: WeightedGraph): Int32Array {
  const local = new Map(topicMembers.map((node, index) => [node, index]));
  const edges: Array<{ source: number; target: number; weight: number }> = [];
  for (const edge of graph.edges) {
    const a = local.get(edge.source);
    const b = local.get(edge.target);
    if (a !== undefined && b !== undefined)
      edges.push({ source: a, target: b, weight: edge.weight });
  }
  const assignment = new Int32Array(topicMembers.length).fill(-1);
  if (topicMembers.length < 12) return assignment;

  const { membership } = louvain(buildCompactGraph(topicMembers.length, edges), 1);
  assignment.set(membership);
  // 子图上的邻接，给 absorbSmall 用
  const subGraph: WeightedGraph = {
    count: topicMembers.length,
    edges: edges.map(e => ({ ...e, explicit: false })),
    adjacency: topicMembers.map(() => new Map<number, number>()),
    linkDegree: new Int32Array(topicMembers.length),
  };
  for (const edge of edges) {
    subGraph.adjacency[edge.source].set(edge.target, edge.weight);
    subGraph.adjacency[edge.target].set(edge.source, edge.weight);
  }
  absorbSmall(assignment, subGraph, Math.max(4, Math.ceil(topicMembers.length * 0.06)));
  // 只分出一个子主题等于没分
  if (groupsOf(assignment).size < 2) assignment.fill(-1);
  return assignment;
}

/* ───────── 颜色 ───────── */

function hashLabel(label: string): number {
  let hash = 2166136261;
  for (let i = 0; i < label.length; i++) {
    hash ^= label.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * 色槽按名字哈希优先、冲突顺延：重算后主题 id 会变，但名字不变颜色就不变，
 * 用户记住的「JavaScript 是蓝色」不会因为加了几张卡就失效。大主题先挑。
 */
function assignColorSlots(topics: Array<{ id: number; label: string; size: number }>) {
  const taken = new Set<number>();
  const slots = new Map<number, number>();
  for (const topic of [...topics].sort((a, b) => b.size - a.size || a.id - b.id)) {
    let slot = hashLabel(topic.label) % TOPIC_PALETTE_SIZE;
    for (let i = 0; i < TOPIC_PALETTE_SIZE && taken.has(slot); i++) {
      slot = (slot + 1) % TOPIC_PALETTE_SIZE;
    }
    taken.add(slot);
    slots.set(topic.id, slot);
  }
  return slots;
}

/* ───────── 布局 ───────── */

/** 确定性伪随机：同样的输入必须得到同样的地图 */
function seeded(seed: number) {
  let value = seed >>> 0 || 1;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

interface Disc extends SimulationNodeDatum {
  key: number;
  radius: number;
}

/** 把一组圆（主题或子主题）按亲近关系摆开：亲近的挨着，互不重叠 */
function packDiscs(
  discs: Disc[],
  links: Array<{ source: number; target: number; weight: number }>,
  random: () => number,
  gap: number
) {
  if (discs.length === 0) return;
  // 黄金角螺旋起步，大的在中间
  discs
    .slice()
    .sort((a, b) => b.radius - a.radius)
    .forEach((disc, i) => {
      const angle = i * 2.39996;
      const r = Math.sqrt(i) * (disc.radius + gap) * 1.2;
      disc.x = Math.cos(angle) * r;
      disc.y = Math.sin(angle) * r;
    });
  if (discs.length === 1) {
    discs[0].x = 0;
    discs[0].y = 0;
    return;
  }
  const maxWeight = Math.max(1e-6, ...links.map(l => l.weight));
  const byKey = new Map(discs.map(d => [d.key, d]));
  const simLinks = links
    .filter(l => byKey.has(l.source) && byKey.has(l.target))
    .map(l => ({ source: l.source, target: l.target, weight: l.weight }));
  const simulation = forceSimulation<Disc>(discs)
    .randomSource(random)
    .force(
      "link",
      forceLink<Disc, SimulationLinkDatum<Disc> & { weight: number }>(simLinks)
        .id(d => d.key)
        .distance(l => (l.source as Disc).radius + (l.target as Disc).radius + gap)
        .strength(l => 0.05 + 0.4 * (l.weight / maxWeight))
    )
    .force("collide", forceCollide<Disc>(d => d.radius + gap / 2).iterations(3))
    .force("x", forceX<Disc>(0).strength(0.04))
    .force("y", forceY<Disc>(0).strength(0.04))
    .stop();
  simulation.tick(300);
}

interface MapNodeDatum extends SimulationNodeDatum {
  index: number;
  radius: number;
  anchorX: number;
  anchorY: number;
  /** 未归类的卡片：推到外圈 */
  loose: boolean;
}

/* ───────── 入口 ───────── */

export function computeKnowledgeMap(
  cards: KnowledgeMapCardInput[],
  vectors: CardVector[],
  options: ComputeOptions = {}
): KnowledgeMap {
  const now = options.now ?? Date.now();
  if (cards.length === 0) return { nodes: [], topics: [], computedAt: now };

  const graph = buildWeightedGraph(cards, vectors, {
    neighbors: options.neighbors ?? 8,
    minSimilarity: options.minSimilarity ?? 0.35,
  });

  const labelMember = (node: number): LabelMember => ({ tags: cards[node].tags });
  const labelFor = (members: number[]) => topicLabel(members.map(labelMember));
  const vectorById = new Map(vectors.map(v => [v.id, v.vector]));
  const vectorOf = cards.map(card => vectorById.get(card.id));

  // 1) 大主题。顺序要紧：先命名并同名合并，再按色槽数封顶——
  // 语义上被切成几块的同一主题（「Canvas」的两个互不相连的子块）
  // 先靠名字并回去，封顶时就不会误伤别的主题
  const headCoverage = (members: number[], label: string) =>
    members.filter(node => cards[node].tags.some(tag => tagPath(tag)[0] === label)).length /
    Math.max(1, members.length);

  const topicOf = detectTopics(graph);
  mergeByLabel(topicOf, labelFor);
  capTopics(topicOf, graph, vectorOf);
  splitIncoherent(topicOf, graph, labelFor, headCoverage);
  // 封顶合并后主题成分变了，名字要按新成员重取，并再做一次同名合并
  const labelOf = mergeByLabel(topicOf, labelFor);
  const groups = groupsOf(topicOf);

  // 3) 按规模重新编号（0 是最大的主题），并分子主题
  const orderedTopics = [...groups.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0] - b[0]
  );
  const topics: KnowledgeMapTopic[] = [];
  const topicIndex = new Int32Array(cards.length).fill(-1);
  const subtopicIndex = new Int32Array(cards.length).fill(-1);
  const subtopicsByTopic = new Map<number, Array<{ id: number; members: number[] }>>();

  orderedTopics.forEach(([oldGroup, members], newId) => {
    for (const node of members) topicIndex[node] = newId;
    topics.push({
      id: newId,
      parent: -1,
      label: labelOf.get(oldGroup)!,
      colorSlot: 0,
      size: members.length,
    });
  });

  let nextId = topics.length;
  orderedTopics.forEach(([, members], topicId) => {
    const sub = detectSubtopics(members, graph);
    const parentLabel = topics[topicId].label;
    // 子块先命名，同名的合并：「CSS」下三块都叫「DOM」，用户眼里就是一个子主题。
    // 无名子块各自保留（它们照样参与布局，只是不显示名字）
    const named = new Map<string, number[]>();
    const unnamed: number[][] = [];
    for (const [, local] of [...groupsOf(sub).entries()].sort(
      (a, b) => b[1].length - a[1].length || a[0] - b[0]
    )) {
      const nodes = local.map(i => members[i]);
      const label = subtopicLabel(nodes.map(labelMember), parentLabel);
      if (!label) {
        unnamed.push(nodes);
        continue;
      }
      named.set(label, [...(named.get(label) ?? []), ...nodes]);
    }
    const entries: Array<[string, number[]]> = [
      ...named.entries(),
      ...unnamed.map(nodes => ["", nodes] as [string, number[]]),
    ].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

    const list: Array<{ id: number; members: number[] }> = [];
    for (const [label, nodes] of entries) {
      const id = nextId++;
      for (const node of nodes) subtopicIndex[node] = id;
      list.push({ id, members: nodes });
      topics.push({ id, parent: topicId, label, colorSlot: 0, size: nodes.length });
    }
    subtopicsByTopic.set(topicId, list);
  });

  const slots = assignColorSlots(topics.filter(t => t.parent === -1));
  for (const topic of topics) {
    topic.colorSlot = slots.get(topic.parent === -1 ? topic.id : topic.parent) ?? 0;
  }

  // 4) 分层布局：先摆大主题，再在主题内摆子主题，最后全体节点一起松弛
  const random = seeded(cards.length * 7919 + graph.edges.length);
  const nodeRadius = Array.from(graph.linkDegree, degree => mapNodeRadius(degree));
  const discRadius = (members: number[]) =>
    Math.sqrt(members.reduce((sum, node) => sum + (nodeRadius[node] + 2) ** 2, 0)) * 1.25 + 12;

  const interTopic = new Map<string, { source: number; target: number; weight: number }>();
  for (const edge of graph.edges) {
    const a = topicIndex[edge.source];
    const b = topicIndex[edge.target];
    if (a < 0 || b < 0 || a === b) continue;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    const entry = interTopic.get(key) ?? {
      source: Math.min(a, b),
      target: Math.max(a, b),
      weight: 0,
    };
    entry.weight += edge.weight;
    interTopic.set(key, entry);
  }
  const topicDiscs: Disc[] = orderedTopics.map(([, members], id) => ({
    key: id,
    radius: discRadius(members),
  }));
  packDiscs(topicDiscs, [...interTopic.values()], random, 70);

  const anchorX = new Float64Array(cards.length);
  const anchorY = new Float64Array(cards.length);
  orderedTopics.forEach(([, members], topicId) => {
    const center = topicDiscs[topicId];
    const subs = subtopicsByTopic.get(topicId) ?? [];
    const subDiscs: Disc[] = subs.map(sub => ({ key: sub.id, radius: discRadius(sub.members) }));
    const interSub = new Map<string, { source: number; target: number; weight: number }>();
    for (const edge of graph.edges) {
      const a = subtopicIndex[edge.source];
      const b = subtopicIndex[edge.target];
      if (a < 0 || b < 0 || a === b || topicIndex[edge.source] !== topicId) continue;
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      const entry = interSub.get(key) ?? {
        source: Math.min(a, b),
        target: Math.max(a, b),
        weight: 0,
      };
      entry.weight += edge.weight;
      interSub.set(key, entry);
    }
    packDiscs(subDiscs, [...interSub.values()], random, 18);
    const subCenter = new Map(subDiscs.map(d => [d.key, d]));
    for (const node of members) {
      const sub = subCenter.get(subtopicIndex[node]);
      anchorX[node] = (center.x ?? 0) + (sub?.x ?? 0);
      anchorY[node] = (center.y ?? 0) + (sub?.y ?? 0);
    }
  });

  let extent = 0;
  for (const disc of topicDiscs) {
    extent = Math.max(extent, Math.hypot(disc.x ?? 0, disc.y ?? 0) + disc.radius);
  }
  const outerRing = extent + 90;

  const datums: MapNodeDatum[] = cards.map((_, index) => {
    const loose = topicIndex[index] < 0;
    const angle = random() * Math.PI * 2;
    const spread = loose ? outerRing + random() * 60 : random() * 30;
    const baseX = loose ? 0 : anchorX[index];
    const baseY = loose ? 0 : anchorY[index];
    return {
      index,
      radius: nodeRadius[index],
      anchorX: loose ? Math.cos(angle) * outerRing : baseX,
      anchorY: loose ? Math.sin(angle) * outerRing : baseY,
      loose,
      x: baseX + Math.cos(angle) * spread,
      y: baseY + Math.sin(angle) * spread,
    };
  });

  const simLinks = graph.edges
    .filter(e => topicIndex[e.source] >= 0 && topicIndex[e.source] === topicIndex[e.target])
    .map(e => ({ source: e.source, target: e.target, weight: e.weight, explicit: e.explicit }));

  forceSimulation<MapNodeDatum>(datums)
    .randomSource(random)
    .force(
      "link",
      forceLink<
        MapNodeDatum,
        SimulationLinkDatum<MapNodeDatum> & { weight: number; explicit: boolean }
      >(simLinks)
        .id(d => d.index)
        .distance(l => (l.explicit ? 16 : 22))
        .strength(l => Math.min(0.6, 0.08 + 0.2 * l.weight))
    )
    .force("charge", forceManyBody<MapNodeDatum>().strength(-14).distanceMax(90))
    .force("collide", forceCollide<MapNodeDatum>(d => d.radius + 2).iterations(2))
    // 锚点力把节点留在所属（子）主题的圆盘里：岛与岛之间有清楚的水道
    .force(
      "x",
      forceX<MapNodeDatum>(d => d.anchorX).strength(d => (d.loose ? 0.06 : 0.14))
    )
    .force(
      "y",
      forceY<MapNodeDatum>(d => d.anchorY).strength(d => (d.loose ? 0.06 : 0.14))
    )
    .velocityDecay(0.4)
    .stop()
    .tick(options.ticks ?? 260);

  const nodes: KnowledgeMapNode[] = cards.map((card, index) => ({
    cardId: card.id,
    // 存两位小数就够，库里省空间、diff 也稳定
    x: Math.round((datums[index].x ?? 0) * 100) / 100,
    y: Math.round((datums[index].y ?? 0) * 100) / 100,
    topic: topicIndex[index],
    subtopic: subtopicIndex[index],
  }));

  return { nodes, topics, computedAt: now };
}

/**
 * 增量放置：新卡片不重算全图，按语义近邻的坐标加权落位、按多数归属主题。
 * 近邻里没有已在图上的卡片时归入未归类并放到外圈。
 */
export function placeIncrementally(
  map: KnowledgeMap,
  card: { id: number; neighbors: Array<{ cardId: number; similarity: number }> }
): KnowledgeMapNode {
  const byId = new Map(map.nodes.map(node => [node.cardId, node]));
  const placed = card.neighbors.filter(n => byId.has(n.cardId));
  if (placed.length === 0) {
    let extent = 0;
    for (const node of map.nodes) extent = Math.max(extent, Math.hypot(node.x, node.y));
    const angle = (((card.id * 2.39996) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return {
      cardId: card.id,
      x: Math.cos(angle) * (extent + 60),
      y: Math.sin(angle) * (extent + 60),
      topic: -1,
      subtopic: -1,
    };
  }

  let totalWeight = 0;
  let x = 0;
  let y = 0;
  const topicVotes = new Map<number, number>();
  const subtopicVotes = new Map<number, number>();
  for (const neighbor of placed) {
    const node = byId.get(neighbor.cardId)!;
    const weight = Math.max(1e-3, neighbor.similarity);
    totalWeight += weight;
    x += node.x * weight;
    y += node.y * weight;
    topicVotes.set(node.topic, (topicVotes.get(node.topic) ?? 0) + weight);
    subtopicVotes.set(node.subtopic, (subtopicVotes.get(node.subtopic) ?? 0) + weight);
  }
  const winner = (votes: Map<number, number>) =>
    [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
  const topic = winner(topicVotes);
  // 子主题必须属于选中的大主题
  const topicOfSub = new Map(map.topics.map(t => [t.id, t.parent]));
  const subtopic = winner(
    new Map([...subtopicVotes].filter(([id]) => topicOfSub.get(id) === topic)).set(-1, 0)
  );
  // 与质心错开一点，免得和某个近邻完全重合
  const angle = (((card.id * 2.39996) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return {
    cardId: card.id,
    x: x / totalWeight + Math.cos(angle) * 8,
    y: y / totalWeight + Math.sin(angle) * 8,
    topic,
    subtopic,
  };
}
