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
  NO_COLOR_SLOT,
  TOPIC_PALETTE_SIZE,
  type KnowledgeMap,
  type KnowledgeMapNodeInput,
  type KnowledgeMapNode,
  type KnowledgeMapTopic,
} from "./types";
import { capInDegree, knn, type CardVector } from "./vectors";

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
/** 每个节点最多被「近邻数 × 该系数」个节点选作语义近邻（见 vectors.capInDegree） */
const IN_DEGREE_CAP_FACTOR = 2;
/**
 * 摆大主题时，跨主题的显式链接再额外放大这么多倍。
 * 跨主题链接很少（真实数据 324 条里只有 6 条），不放大就淹没在几百条语义边里；
 * 但它们是画面上唯一会被画出来的跨岛连线，太长就是一道横穿地图的划痕。
 */
const CROSS_LINK_BOOST = 4;
/**
 * 桥接卡片朝对方主题挪多远（相对两岛中心距的比例，上限见 bridgePull 处）。
 * 原来是最终松弛里的一条弱弹簧（强度 0.1，静长 0），真实数据上跨主题连线均长 201→155；
 * 但那要求松弛跨岛进行。改成直接挪锚点后效果等价，松弛就能按岛切开跑（快得多）。
 */
const BRIDGE_ANCHOR_SHIFT = 0.25;
const RESOLUTIONS = [0.15, 0.25, 0.35, 0.5, 0.7, 1, 1.4];

/**
 * 大主题数量的目标区间，随规模按对数增长：50 张约 5 个、700 张约 8 个、2 万张约 13 个。
 * 只是「挑哪一档分辨率」的偏好，不是硬约束——数据天然分成 20 块就是 20 块。
 * 规模再大时细节交给子主题层，大主题数不该跟着线性膨胀（一眼看不过来）。
 * 这里与色槽数（视觉约束）无关：主题多于色槽时颜色循环复用、邻居避让，见 assignColorSlots。
 */
export function topicTarget(count: number) {
  const ideal = Math.min(16, Math.max(4, Math.round(3 * Math.log10(Math.max(1, count)))));
  return { min: Math.max(2, ideal - 3), max: ideal + 3, ideal };
}

/** 地图上的节点半径（世界坐标）：比链接图谱小一档，语义岛屿是密的 */
export function mapNodeRadius(degree: number): number {
  return 3.5 + Math.sqrt(degree) * 1.6;
}

/* ───────── 加权图 ───────── */

export interface WeightedGraph {
  count: number;
  edges: Array<{ source: number; target: number; weight: number; explicit: boolean }>;
  /** 每个下标的加权邻接，合并阶段按边权找「最亲近」的主题用 */
  adjacency: Array<Map<number, number>>;
  /** 显式链接的度数（节点大小只按用户亲手建的链接算） */
  linkDegree: Int32Array;
}

function buildWeightedGraph(
  cards: KnowledgeMapNodeInput[],
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
  const neighbors = capInDegree(
    knn(vectors, options.neighbors, options.minSimilarity),
    options.neighbors * IN_DEGREE_CAP_FACTOR
  );
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

/**
 * 往细一档分辨率走，每多一个主题至少要让这么多比例的卡片「名副其实」（名字覆盖率）。
 * 分得越细覆盖率总会涨（块越小越纯），所以不能直接取覆盖率最高的——那等于永远取上限；
 * 要看边际收益：多出来的主题换不来足够多被正确命名的卡片，就停在粗的那一档。
 * 按比例而不是张数：700 张时约 14 张，2 万张时约 400 张。
 */
const RESOLUTION_MIN_GAIN_PER_TOPIC = 0.02;

/**
 * 按分辨率扫描挑大主题划分。
 *
 * 每档都先做同名合并再评估：用户看到的是合并后的主题（两块都叫「JavaScript」就是一个），
 * 按原始分块数挑会被 Louvain 的碎块误导。评估用两样：主题数（落在随规模变化的目标区间里）
 * 与名字覆盖率（成员里真带这个 tag 首段的比例，按人数加权）。
 * 在区间内从最粗的一档起步，只有边际收益够才往细走；区间里一档都没有时退回离 ideal 最近的。
 */
function detectTopics(
  graph: WeightedGraph,
  labelFor: (members: number[]) => string,
  headCoverage: (members: number[], label: string) => number
): Int32Array {
  const compact = buildCompactGraph(graph.count, graph.edges);
  const minTopic = minTopicSize(graph.count);
  const target = topicTarget(graph.count);

  const candidates = RESOLUTIONS.map(resolution => {
    const { membership } = louvain(compact, resolution);
    const assignment = Int32Array.from(membership);
    // 孤立节点（加权度 0）不属于任何主题
    for (let i = 0; i < graph.count; i++) if (graph.adjacency[i].size === 0) assignment[i] = -1;
    absorbSmall(assignment, graph, minTopic);
    mergeByLabel(assignment, labelFor);
    const groups = groupsOf(assignment);
    let covered = 0;
    for (const members of groups.values()) {
      const label = labelFor(members);
      if (label) covered += headCoverage(members, label) * members.length;
    }
    return { assignment, count: groups.size, coverage: covered / Math.max(1, graph.count) };
  });

  const inRange = candidates
    .filter(c => c.count >= target.min && c.count <= target.max)
    .sort((a, b) => a.count - b.count);
  if (inRange.length === 0) {
    return candidates.reduce((best, c) =>
      Math.abs(c.count - target.ideal) < Math.abs(best.count - target.ideal) ? c : best
    ).assignment;
  }
  let chosen = inRange[0];
  for (const next of inRange.slice(1)) {
    const added = next.count - chosen.count;
    // 主题数没变但覆盖率更高：同样多的名字、更准，直接换
    if (added === 0) {
      if (next.coverage > chosen.coverage) chosen = next;
      continue;
    }
    if ((next.coverage - chosen.coverage) / added < RESOLUTION_MIN_GAIN_PER_TOPIC) break;
    chosen = next;
  }
  return chosen.assignment;
}

/** 一个大主题至少要有这么多张卡；再小的并进最亲近的主题（按规模缩放，万级时不出现几十个碎主题） */
function minTopicSize(count: number) {
  return Math.max(4, Math.ceil(count * 0.012));
}

/**
 * 小主题的连接有一半以上都通向另一个主题，才并过去。
 *
 * 只看图上的实际连接，不再为了凑色槽数强行合并：上一版超过 10 个就把最小的并进
 * 「最亲近」的主题，图上不连通时还退到向量质心去找，结果是把不相干的主题揉在一起。
 * 主题数多于色槽时颜色循环复用、相邻的不同色（见 assignColorSlots），名字和岛都保留。
 * 这一步主要兜住同名合并之后的形态：两个主题靠名字并过一次，第三个挂在它们之间的小块
 * 可能因此变成「几乎全连着同一边」。
 */
const MERGE_AFFINITY_SHARE = 0.5;

function mergeStronglyConnected(assignment: Int32Array, graph: WeightedGraph) {
  for (;;) {
    const groups = [...groupsOf(assignment).entries()].sort(
      (a, b) => a[1].length - b[1].length || a[0] - b[0]
    );
    let merged = false;
    for (const [group, members] of groups) {
      let total = 0;
      for (const node of members)
        for (const weight of graph.adjacency[node].values()) total += weight;
      if (total <= 0) continue;
      const scores = affinity(members, assignment, graph);
      const target = strongest(scores, group);
      if (target < 0 || (scores.get(target) ?? 0) / total <= MERGE_AFFINITY_SHARE) continue;
      for (const node of members) assignment[node] = target;
      merged = true;
      break;
    }
    if (!merged) return;
  }
}

/** 大主题名的覆盖率低于它就算「名不副实」，考虑拆开；拆出的每一块也都要达到它 */
const TOPIC_COHERENCE = 0.4;
/**
 * 拆完后名字覆盖率（按人数加权）至少要提高这么多才拆。
 * 这是「拆分是否值得」的唯一驱动：拆得动但名字没因此变准，就说明原主题本来就是
 * 一片连着的内容，硬拆只会多出一个名字、少掉一份真实。
 */
const SPLIT_MIN_GAIN = 0.15;

/**
 * 拆开名不副实的大主题。
 *
 * 真实数据里人文类卡片（经济、概念、学习方法、随笔、读书……）在向量空间里连成一片，
 * 分出来是一个大主题，却只能取占 27% 的「经济」当名字——名字在误导人。
 * 这时按主题内部的子结构拆：各子块自己取名，同名的并起来，本身名副其实的提升为
 * 独立大主题；只有拆完后名字整体明显变准才真的拆，拆多少块完全由数据决定，
 * 与色槽数无关。
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
  const minTopic = minTopicSize(graph.count);

  for (const [, members] of groups) {
    const label = labelFor(members);
    if (!label || members.length < minTopic * 3) continue;
    const before = headCoverage(members, label);
    if (before >= TOPIC_COHERENCE) continue;

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
    if (candidates.length < 2) continue;

    // 最大的一块留在原主题里（继承原来的分组 id，连同没能独立的零散成员），其余提升。
    // 拆后覆盖率按「每块用自己的新名字」算；留下的那块要重新取名再算
    const promoted = candidates.slice(1);
    const moved = new Set(promoted.flatMap(([, nodes]) => nodes));
    const rest = members.filter(node => !moved.has(node));
    const restLabel = labelFor(rest);
    let covered = restLabel ? headCoverage(rest, restLabel) * rest.length : 0;
    for (const [subLabel, nodes] of promoted)
      covered += headCoverage(nodes, subLabel) * nodes.length;
    if (covered / members.length - before < SPLIT_MIN_GAIN) continue;

    for (const [, nodes] of promoted) {
      const group = nextGroup++;
      for (const node of nodes) assignment[node] = group;
    }
  }
}

/**
 * 一个名字（tag 首段，或无 tag 项目文档的项目名）的成员里，至少这么多比例的连接权重要落在彼此之间，
 * 才算「自成一体」，可以从所在大主题里独立出来。
 */
const LABEL_COHESION = 0.5;

/**
 * 按名字独立：大主题里某个名字有足够多的成员、且这些成员主要彼此相连，就独立成大主题。
 *
 * 补 splitIncoherent 的盲区：那里看「拆了之后整张图的名字准了多少」，块越小越拉不动整体，
 * 于是 TypeScript、一整个 Docker 教程项目这类边界清楚的小主题，始终埋在 JavaScript 底下。
 * 这里只看这群成员自己：够不够多、是不是主要连着彼此。与所在大主题同名的不动。
 */
export function promoteCohesiveLabels(
  assignment: Int32Array,
  graph: WeightedGraph,
  headsOf: (node: number) => string[],
  labelFor: (members: number[]) => string
) {
  let nextGroup = Math.max(-1, ...assignment) + 1;
  const minTopic = minTopicSize(graph.count);
  for (const [, members] of groupsOf(assignment)) {
    if (members.length < minTopic * 2) continue;
    const parentLabel = labelFor(members);
    const byHead = new Map<string, number[]>();
    for (const node of members) {
      for (const head of new Set(headsOf(node))) {
        if (!head || head === parentLabel) continue;
        const list = byHead.get(head) ?? [];
        list.push(node);
        byHead.set(head, list);
      }
    }
    const candidates = [...byHead.entries()]
      .filter(([, nodes]) => nodes.length >= minTopic)
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    const moved = new Set<number>();
    for (const [, nodes] of candidates) {
      const group = nodes.filter(node => !moved.has(node));
      if (group.length < minTopic || members.length - moved.size - group.length < minTopic)
        continue;
      const inside = new Set(group);
      let internal = 0;
      let total = 0;
      for (const node of group) {
        for (const [other, weight] of graph.adjacency[node]) {
          total += weight;
          if (inside.has(other)) internal += weight;
        }
      }
      if (total <= 0 || internal / total < LABEL_COHESION) continue;
      const id = nextGroup++;
      for (const node of group) {
        assignment[node] = id;
        moved.add(node);
      }
    }
  }
}

/** 无名子主题里带父主题名的成员不到这个比例，就归为「其它」 */
const MISC_SUBTOPIC_SHARE = 0.5;
export const MISC_SUBTOPIC_LABEL = "其它";

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
 *
 * 色槽只有 TOPIC_PALETTE_SIZE 个（再多颜色就分不开），主题多于色槽时循环复用，
 * 但像给地图着色一样避开相邻主题已用的颜色：同色的两个主题不会挨在一起，
 * 一眼仍分得清边界。每个主题都有颜色，中性色只留给未归类的卡片。
 *
 * 挑选顺序（从名字哈希的那一格起顺延）：
 *  1) 全图还没人用、邻居也没用的；
 *  2) 邻居没用的；
 *  3) 都用过了（邻居比色槽还多）就取邻居里用得最少的。
 * 前 TOPIC_PALETTE_SIZE 个主题总能落在第 1 档，所以与只有 10 个主题时的分配完全一致。
 */
function assignColorSlots(
  topics: Array<{ id: number; label: string; size: number }>,
  neighborsOf: (id: number) => Iterable<number>
) {
  const slots = new Map<number, number>();
  const usage = new Array<number>(TOPIC_PALETTE_SIZE).fill(0);
  const ranked = [...topics].sort((a, b) => b.size - a.size || a.id - b.id);
  for (const topic of ranked) {
    const nearby = new Array<number>(TOPIC_PALETTE_SIZE).fill(0);
    for (const other of neighborsOf(topic.id)) {
      const slot = slots.get(other);
      if (slot !== undefined) nearby[slot] += 1;
    }
    const start = hashLabel(topic.label) % TOPIC_PALETTE_SIZE;
    let best = start;
    let bestScore = Infinity;
    for (let i = 0; i < TOPIC_PALETTE_SIZE; i++) {
      const slot = (start + i) % TOPIC_PALETTE_SIZE;
      // 邻居冲突压倒一切，其次才是全图是否用过；同分取顺延更早的一格
      const score = nearby[slot] * TOPIC_PALETTE_SIZE * 1000 + usage[slot];
      if (score < bestScore) {
        best = slot;
        bestScore = score;
      }
    }
    usage[best] += 1;
    slots.set(topic.id, best);
  }
  return slots;
}

/**
 * 地图上相邻的主题：圆盘边缘间距小于 reach，或两者之间有连边。
 * 看空间而不只看连边：两个互不相连的语义孤岛也可能被摆在一起，同色就会糊成一块。
 */
function topicNeighbors(
  discs: Disc[],
  links: Array<{ source: number; target: number }>,
  reach: number
): Map<number, Set<number>> {
  const result = new Map(discs.map(d => [d.key, new Set<number>()]));
  const link = (a: number, b: number) => {
    result.get(a)?.add(b);
    result.get(b)?.add(a);
  };
  for (const { source, target } of links) link(source, target);
  for (let i = 0; i < discs.length; i++) {
    for (let j = i + 1; j < discs.length; j++) {
      const a = discs[i];
      const b = discs[j];
      const gap =
        Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0)) - a.radius - b.radius;
      if (gap < reach) link(a.key, b.key);
    }
  }
  return result;
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

/** 摆大主题时每个主题只被它最亲近的这么几个主题拉 */
const TOPIC_LAYOUT_NEIGHBORS = 3;

/**
 * 每个主题只保留最亲近的 k 条关系（取两端各自前 k 的并集）。
 * 主题两两之间几乎都有些语义边：全部当弹簧时每个主题被所有人往中间拽，
 * 结果是谁也挨不着谁；只留最强的几条，亲近的才真的挨在一起。
 */
function strongestPairs<T extends { source: number; target: number; weight: number }>(
  pairs: Iterable<T>,
  k: number
): T[] {
  const list = [...pairs];
  const byTopic = new Map<number, T[]>();
  for (const pair of list) {
    for (const end of [pair.source, pair.target]) {
      const own = byTopic.get(end) ?? [];
      own.push(pair);
      byTopic.set(end, own);
    }
  }
  const kept = new Set<T>();
  for (const own of byTopic.values()) {
    own.sort((a, b) => b.weight - a.weight || a.source - b.source || a.target - b.target);
    for (const pair of own.slice(0, k)) kept.add(pair);
  }
  return list.filter(pair => kept.has(pair));
}

/**
 * 按亲近关系贪心地给圆盘找初始位置：最大的放中间，之后每次挑与已放置者关系最强的那个，
 * 贴着它最亲近的已放置圆盘摆，在一圈候选角度里取不重叠、且离其他亲近者最近的位置。
 *
 * 为什么不用螺旋起步再靠力拉：圆盘互相碰撞，穿不过彼此。螺旋起步时两个最亲近的主题
 * 若一开始隔着几个岛，弹簧再强也拉不过来（真实数据里 CSS↔DOM 就卡在隔了一个岛的位置）。
 * 起步就摆对，后面的力模拟只做微调。
 */
function seedByAffinity(
  discs: Disc[],
  links: Array<{ source: number; target: number; weight: number }>,
  gap: number
) {
  const byKey = new Map(discs.map(d => [d.key, d]));
  const weightOf = new Map<number, Map<number, number>>();
  for (const { source, target, weight } of links) {
    if (!byKey.has(source) || !byKey.has(target)) continue;
    for (const [a, b] of [
      [source, target],
      [target, source],
    ]) {
      const own = weightOf.get(a) ?? new Map<number, number>();
      own.set(b, (own.get(b) ?? 0) + weight);
      weightOf.set(a, own);
    }
  }
  const placed: Disc[] = [];
  const pending = new Set(discs);
  const place = (disc: Disc, x: number, y: number) => {
    disc.x = x;
    disc.y = y;
    placed.push(disc);
    pending.delete(disc);
  };
  const first = [...discs].sort((a, b) => b.radius - a.radius || a.key - b.key)[0];
  place(first, 0, 0);

  const ANGLES = 24;
  while (pending.size > 0) {
    // 下一个：与已放置者关系总和最大的；都没关系就挑最大的（放到外圈）
    let next: Disc | null = null;
    let nextScore = -1;
    for (const disc of pending) {
      const own = weightOf.get(disc.key);
      let score = 0;
      if (own) for (const other of placed) score += own.get(other.key) ?? 0;
      if (
        score > nextScore ||
        (score === nextScore && next && (disc.radius > next.radius || disc.key < next.key))
      ) {
        next = disc;
        nextScore = score;
      }
    }
    const disc = next!;
    const own = weightOf.get(disc.key) ?? new Map<number, number>();
    const partners = placed
      .map(other => ({ other, weight: own.get(other.key) ?? 0 }))
      .filter(p => p.weight > 0)
      .sort((a, b) => b.weight - a.weight || a.other.key - b.other.key);
    // 没有亲近者：贴着已放置整体的外沿（离原点最近的不重叠位置）
    const anchors = partners.length > 0 ? partners.slice(0, 3).map(p => p.other) : placed;

    let best: { x: number; y: number; cost: number } | null = null;
    for (const anchor of anchors) {
      const reach = anchor.radius + disc.radius + gap;
      for (let i = 0; i < ANGLES; i++) {
        const angle = (i / ANGLES) * Math.PI * 2;
        const x = (anchor.x ?? 0) + Math.cos(angle) * reach;
        const y = (anchor.y ?? 0) + Math.sin(angle) * reach;
        const overlaps = placed.some(
          other =>
            Math.hypot(x - (other.x ?? 0), y - (other.y ?? 0)) <
            other.radius + disc.radius + gap * 0.9
        );
        if (overlaps) continue;
        // 代价：到各亲近者的边缘距离按关系强度加权；没有亲近者时离原点越近越好（紧凑）
        let cost = 0;
        if (partners.length > 0) {
          for (const { other, weight } of partners) {
            const edgeGap =
              Math.hypot(x - (other.x ?? 0), y - (other.y ?? 0)) - other.radius - disc.radius;
            cost += weight * edgeGap;
          }
        } else {
          cost = Math.hypot(x, y);
        }
        if (!best || cost < best.cost) best = { x, y, cost };
      }
    }
    if (best) {
      place(disc, best.x, best.y);
      continue;
    }
    // 一圈都挤满了：放到整体外沿
    let extent = 0;
    for (const other of placed) {
      extent = Math.max(extent, Math.hypot(other.x ?? 0, other.y ?? 0) + other.radius);
    }
    const angle = placed.length * 2.39996;
    place(
      disc,
      Math.cos(angle) * (extent + disc.radius + gap),
      Math.sin(angle) * (extent + disc.radius + gap)
    );
  }
}

/**
 * 岛内朝向：把一个主题内的子主题圆盘（相对主题中心的坐标）整体旋转、必要时镜像，
 * 让连向外部主题的子主题落在岛上面向那个主题的一侧。
 *
 * 只做刚体变换（旋转 + 镜像），不改子主题之间的相对位置：packDiscs 摆好的
 * 「谁挨着谁」原样保留，岛的形状也不变。候选 36 个角度 × 2 个镜像，取外拉力做功最大的。
 */
function orientTowardOutside(
  subDiscs: Disc[],
  center: Disc,
  pullOf: (sub: number) => Array<{ topic: number; weight: number }>,
  topicDisc: (topic: number) => Disc | undefined
) {
  if (subDiscs.length < 2) return;
  // 每个子主题受的外拉力：指向各外部主题中心的单位向量按权重求和
  const pulls = subDiscs.map(disc => {
    let px = 0;
    let py = 0;
    for (const { topic, weight } of pullOf(disc.key)) {
      const target = topicDisc(topic);
      if (!target) continue;
      const dx = (target.x ?? 0) - (center.x ?? 0);
      const dy = (target.y ?? 0) - (center.y ?? 0);
      const length = Math.hypot(dx, dy) || 1;
      px += (dx / length) * weight;
      py += (dy / length) * weight;
    }
    return { px, py };
  });
  if (pulls.every(p => p.px === 0 && p.py === 0)) return;

  const STEPS = 36;
  let best = { angle: 0, mirror: 1, score: -Infinity };
  for (const mirror of [1, -1]) {
    for (let i = 0; i < STEPS; i++) {
      const angle = (i / STEPS) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      let score = 0;
      subDiscs.forEach((disc, k) => {
        const x = disc.x ?? 0;
        const y = (disc.y ?? 0) * mirror;
        // 变换后的位置在外拉方向上的投影：越靠向拉它的主题越好
        score += (x * cos - y * sin) * pulls[k].px + (x * sin + y * cos) * pulls[k].py;
      });
      // 平手取不变换（angle 0、不镜像）：没有明确收益就别动
      if (score > best.score + 1e-9) best = { angle, mirror, score };
    }
  }
  const cos = Math.cos(best.angle);
  const sin = Math.sin(best.angle);
  for (const disc of subDiscs) {
    const x = disc.x ?? 0;
    const y = (disc.y ?? 0) * best.mirror;
    disc.x = x * cos - y * sin;
    disc.y = x * sin + y * cos;
  }
}

/**
 * 主题两两之间的亲近度，决定摆大主题时谁挨着谁。
 *
 * 按原始边权算时大主题天然占优（边多）：真实数据里最亲近的 TypeScript↔JavaScript
 * 被推到了地图另一头、跨主题的链接横穿整张图。所以按较小一方的规模归一——
 * 「小主题有多大比例的关系指向对方」。显式链接另外乘 CROSS_LINK_BOOST：
 * 用户亲手连过的两个主题，连线要短。
 */
export function topicAffinity(
  edges: ReadonlyArray<{ source: number; target: number; weight: number; explicit: boolean }>,
  topicOf: ArrayLike<number>,
  topicSizes: readonly number[]
): Map<string, { source: number; target: number; weight: number }> {
  const result = new Map<string, { source: number; target: number; weight: number }>();
  for (const edge of edges) {
    const a = topicOf[edge.source];
    const b = topicOf[edge.target];
    if (a < 0 || b < 0 || a === b) continue;
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    const entry = result.get(key) ?? { source: Math.min(a, b), target: Math.max(a, b), weight: 0 };
    entry.weight += edge.explicit ? edge.weight * CROSS_LINK_BOOST : edge.weight;
    result.set(key, entry);
  }
  for (const entry of result.values()) {
    entry.weight /= Math.max(1, Math.min(topicSizes[entry.source], topicSizes[entry.target]));
  }
  return result;
}

/**
 * 子主题内部每张卡的锚点：按向日葵螺旋（黄金角）铺在圆盘里，间距取成员的平均直径。
 *
 * 先前所有成员共用一个锚点（子主题中心），松弛就成了「锚点往里拉、碰撞往外推」的拉锯：
 * 画面松不松完全取决于迭代次数，而那一轮占了整条管线 60% 的时间（5000 张的剖析：
 * collide + manyBody + 四叉树）。改成一卡一锚点后，卡片起步就铺开、也不会被拽回中心，
 * 力模拟只做局部微调，迭代次数可以大幅降低。
 * 向日葵而不是网格：圆盘边缘不出现直角，密度也更均匀，看起来仍是自然的一团。
 */
function seedWithinDisc(
  members: number[],
  nodeRadius: number[],
  seedX: Float64Array,
  seedY: Float64Array,
  center: { cx: number; cy: number; radius: number }
) {
  if (members.length === 0) return;
  let radiusSum = 0;
  for (const node of members) radiusSum += nodeRadius[node];
  const average = radiusSum / members.length;
  // 铺到圆盘内为止：越界的话相邻的岛会贴上（岛之间的水道只由 packDiscs 的 gap 保证，
  // 松弛已经按岛切开、不再有跨岛斥力把它们推开）
  const limit = Math.max(0, center.radius - average - 2);
  const last = Math.max(1, members.length - 1);
  // 黄金角：相邻点的角差 ≈ 137.5°，任意半径处都不会排成放射线
  const golden = Math.PI * (3 - Math.sqrt(5));
  members.forEach((node, i) => {
    // 半径按 √(i/last) 增长：面积均匀，最后一个正好落在边缘
    const r = limit * Math.sqrt(i / last);
    const angle = i * golden;
    seedX[node] = center.cx + Math.cos(angle) * r;
    seedY[node] = center.cy + Math.sin(angle) * r;
  });
}

/** 把一组圆（主题或子主题）按亲近关系摆开：亲近的挨着，互不重叠 */
function packDiscs(
  discs: Disc[],
  links: Array<{ source: number; target: number; weight: number }>,
  random: () => number,
  gap: number
) {
  if (discs.length === 0) return;
  if (discs.length === 1) {
    discs[0].x = 0;
    discs[0].y = 0;
    return;
  }
  seedByAffinity(discs, links, gap);
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
        .strength(l => 0.1 + 0.6 * (l.weight / maxWeight))
    )
    .force("collide", forceCollide<Disc>(d => d.radius + gap / 2).iterations(3))
    .force("x", forceX<Disc>(0).strength(0.04))
    .force("y", forceY<Disc>(0).strength(0.04))
    .stop();
  simulation.tick(300);
}

interface MapNodeDatum extends SimulationNodeDatum {
  /**
   * 卡片在 cards 里的下标。不能叫 index：d3-force 会把 node.index 重写成
   * 「该节点在本次模拟数组里的位置」——全图一次模拟时两者恰好相等，
   * 按岛切开跑之后就错位了（forceLink 按 id 就找不到节点）
   */
  card: number;
  radius: number;
  anchorX: number;
  anchorY: number;
  /** 未归类的卡片：推到外圈 */
  loose: boolean;
}

/* ───────── 入口 ───────── */

export function computeKnowledgeMap(
  cards: KnowledgeMapNodeInput[],
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

  // 1) 大主题。顺序要紧：先命名并同名合并，再并强连接的小块——
  // 语义上被切成几块的同一主题（「Canvas」的两个互不相连的子块）
  // 先靠名字并回去，合并时就不会误伤别的主题
  const headCoverage = (members: number[], label: string) =>
    members.filter(node => cards[node].tags.some(tag => tagPath(tag)[0] === label)).length /
    Math.max(1, members.length);

  const topicOf = detectTopics(graph, labelFor, headCoverage);
  mergeByLabel(topicOf, labelFor);
  mergeStronglyConnected(topicOf, graph);
  splitIncoherent(topicOf, graph, labelFor, headCoverage);
  promoteCohesiveLabels(
    topicOf,
    graph,
    node => cards[node].tags.map(tag => tagPath(tag)[0]),
    labelFor
  );
  // 合并与拆分后主题成分变了，名字要按新成员重取，并再做一次同名合并
  const labelOf = mergeByLabel(topicOf, labelFor);
  const topLabels = new Set([...labelOf.values()].filter(Boolean));
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
      const label =
        subtopicLabel(nodes.map(labelMember), parentLabel, topLabels) ||
        // 取不出名字、且多数成员并不属于父主题：是挂在这里的杂项，明说「其它」，
        // 不让它冒充父主题的一部分；等同类内容攒够了会自己独立出去
        (headCoverage(nodes, parentLabel) < MISC_SUBTOPIC_SHARE ? MISC_SUBTOPIC_LABEL : "");
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

  // 4) 分层布局：先摆大主题，再在主题内摆子主题，最后全体节点一起松弛
  const random = seeded(cards.length * 7919 + graph.edges.length);
  const nodeRadius = Array.from(graph.linkDegree, degree => mapNodeRadius(degree));
  const discRadius = (members: number[]) =>
    Math.sqrt(members.reduce((sum, node) => sum + (nodeRadius[node] + 2) ** 2, 0)) * 1.25 + 12;

  const interTopic = topicAffinity(
    graph.edges,
    topicIndex,
    orderedTopics.map(([, members]) => members.length)
  );
  const topicDiscs: Disc[] = orderedTopics.map(([, members], id) => ({
    key: id,
    radius: discRadius(members),
  }));
  packDiscs(topicDiscs, strongestPairs(interTopic.values(), TOPIC_LAYOUT_NEIGHBORS), random, 70);

  // 颜色要等大主题摆好才能分：循环复用色槽时要知道谁和谁在地图上挨着。
  // reach 取圆盘间距（70）的两倍：隔着一条水道的也算邻居
  const neighbors = topicNeighbors(topicDiscs, [...interTopic.values()], 140);
  const slots = assignColorSlots(
    topics.filter(t => t.parent === -1),
    id => neighbors.get(id) ?? []
  );
  for (const topic of topics) {
    topic.colorSlot = slots.get(topic.parent === -1 ? topic.id : topic.parent) ?? NO_COLOR_SLOT;
  }

  // 每个子主题被哪些外部主题拉着（跨主题的边，显式链接加权）：岛内朝向用
  const outsidePull = new Map<number, Array<{ topic: number; weight: number }>>();
  {
    const byPair = new Map<string, { sub: number; topic: number; weight: number }>();
    for (const edge of graph.edges) {
      for (const [from, to] of [
        [edge.source, edge.target],
        [edge.target, edge.source],
      ]) {
        const sub = subtopicIndex[from];
        const topic = topicIndex[to];
        if (sub < 0 || topic < 0 || topic === topicIndex[from]) continue;
        const key = `${sub}-${topic}`;
        const entry = byPair.get(key) ?? { sub, topic, weight: 0 };
        entry.weight += edge.explicit ? edge.weight * CROSS_LINK_BOOST : edge.weight;
        byPair.set(key, entry);
      }
    }
    for (const { sub, topic, weight } of byPair.values()) {
      const list = outsidePull.get(sub) ?? [];
      list.push({ topic, weight });
      outsidePull.set(sub, list);
    }
  }

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
    // 岛内朝向：连向外部主题的子主题转到岛上面向那个主题的一侧。
    // 不转的话，「CSS/选择器」可能落在 CSS 岛背对 DOM 的一面，连线要横穿整个岛
    orientTowardOutside(
      subDiscs,
      center,
      sub => outsidePull.get(sub) ?? [],
      id => topicDiscs[id]
    );
    const subCenter = new Map(subDiscs.map(d => [d.key, d]));
    // 每张卡的锚点是它自己在（子）主题圆盘里的螺旋位置（不是圆盘中心，见 seedWithinDisc）
    for (const sub of subs) {
      const disc = subCenter.get(sub.id);
      if (!disc) continue;
      seedWithinDisc(sub.members, nodeRadius, anchorX, anchorY, {
        cx: (center.x ?? 0) + (disc.x ?? 0),
        cy: (center.y ?? 0) + (disc.y ?? 0),
        radius: disc.radius,
      });
    }
    // 没分出子主题的卡片（主题太小，或语义上切不开）直接铺在主题圆盘里
    const bare = members.filter(node => subtopicIndex[node] < 0);
    if (bare.length > 0) {
      seedWithinDisc(bare, nodeRadius, anchorX, anchorY, {
        cx: center.x ?? 0,
        cy: center.y ?? 0,
        radius: center.radius,
      });
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
    if (loose) {
      return {
        card: index,
        radius: nodeRadius[index],
        anchorX: Math.cos(angle) * outerRing,
        anchorY: Math.sin(angle) * outerRing,
        loose,
        x: Math.cos(angle) * (outerRing + random() * 60),
        y: Math.sin(angle) * (outerRing + random() * 60),
      };
    }
    return {
      card: index,
      radius: nodeRadius[index],
      anchorX: anchorX[index],
      anchorY: anchorY[index],
      loose,
      x: anchorX[index],
      y: anchorY[index],
    };
  });

  // 桥接：跨主题的显式链接，作为弱力把桥接卡片拉到两个岛相对的边缘。
  // 只取显式链接——跨主题的语义边有几百条，全加进来岛就糊成一片。
  // 岛与岛之间被水道隔开、互不重叠，所以桥接只改锚点（把卡片的锚点朝对方主题挪一点），
  // 不进力模拟：这样松弛可以按岛切开跑，省掉一棵横跨全图的四叉树
  const bridgePull = new Map<number, { x: number; y: number }>();
  for (const edge of graph.edges) {
    if (!edge.explicit) continue;
    const a = topicIndex[edge.source];
    const b = topicIndex[edge.target];
    if (a < 0 || b < 0 || a === b) continue;
    for (const [from, toTopic] of [
      [edge.source, b],
      [edge.target, a],
    ] as const) {
      const target = topicDiscs[toTopic];
      const own = bridgePull.get(from) ?? { x: 0, y: 0 };
      own.x += (target.x ?? 0) - anchorX[from];
      own.y += (target.y ?? 0) - anchorY[from];
      bridgePull.set(from, own);
    }
  }
  for (const [node, pull] of bridgePull) {
    const length = Math.hypot(pull.x, pull.y) || 1;
    // 上限按节点半径给：挪到岛朝外的一侧就够，再远会被拽出自己的（子）主题。
    // 真实数据上扫过 4r+10 / 8r+20 / 14r+30：跨主题连线均长 182 / 169 / 160
    //（原来的跨岛弹簧是 155，不加桥接是 201），岛内链接 p50 始终是 26
    const step = Math.min(length * BRIDGE_ANCHOR_SHIFT, nodeRadius[node] * 14 + 30);
    datums[node].anchorX += (pull.x / length) * step;
    datums[node].anchorY += (pull.y / length) * step;
    datums[node].x = datums[node].anchorX;
    datums[node].y = datums[node].anchorY;
  }

  /**
   * 最后一轮松弛按主题岛分别跑。
   *
   * 岛与岛之间有 70 世界单位的水道（packDiscs 的 gap），卡片受锚点力约束不会越界，
   * 所以一个岛内的碰撞与斥力不会影响别的岛。切开跑省掉的是「横跨全图的四叉树」：
   * 剖析显示 5000 张时 collide + manyBody + 四叉树占整条管线 60%，而四叉树的
   * 遍历成本随图的总规模涨。切开后每棵树只有一个岛那么大，缓存命中也好得多。
   * 未归类的卡片（外圈）单独作为一组。
   */
  const islands = new Map<number, MapNodeDatum[]>();
  for (const datum of datums) {
    const key = topicIndex[datum.card];
    const list = islands.get(key);
    if (list) list.push(datum);
    else islands.set(key, [datum]);
  }
  const islandLinks = new Map<
    number,
    Array<{ source: number; target: number; weight: number; explicit: boolean }>
  >();
  for (const edge of graph.edges) {
    const topic = topicIndex[edge.source];
    if (topic < 0 || topic !== topicIndex[edge.target]) continue;
    const list = islandLinks.get(topic);
    const link = {
      source: edge.source,
      target: edge.target,
      weight: edge.weight,
      explicit: edge.explicit,
    };
    if (list) list.push(link);
    else islandLinks.set(topic, [link]);
  }

  const ticks = options.ticks ?? 260;
  for (const [topic, members] of islands) {
    const links = (islandLinks.get(topic) ?? []).map(l => ({ ...l }));
    forceSimulation<MapNodeDatum>(members)
      .randomSource(random)
      .force(
        "link",
        forceLink<
          MapNodeDatum,
          SimulationLinkDatum<MapNodeDatum> & { weight: number; explicit: boolean }
        >(links)
          .id(d => d.card)
          .distance(l => (l.explicit ? 16 : 22))
          .strength(l => Math.min(0.6, 0.08 + 0.2 * l.weight))
      )
      .force("charge", forceManyBody<MapNodeDatum>().strength(-14).distanceMax(90))
      .force("collide", forceCollide<MapNodeDatum>(d => d.radius + 2).iterations(2))
      // 锚点力把节点留在自己的螺旋位置附近：岛与岛之间有清楚的水道
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
      .tick(ticks);
  }

  const nodes: KnowledgeMapNode[] = cards.map((card, index) => ({
    key: card.key,
    // 存两位小数就够，库里省空间、diff 也稳定
    x: Math.round((datums[index].x ?? 0) * 100) / 100,
    y: Math.round((datums[index].y ?? 0) * 100) / 100,
    topic: topicIndex[index],
    subtopic: subtopicIndex[index],
  }));

  return { nodes, topics, computedAt: now };
}

/**
 * 增量放置：新节点不重算全图，按语义近邻的坐标加权落位、按多数归属主题。
 * 近邻里没有已在图上的节点时归入未归类并放到外圈。seed 只用来错开角度（取数值 id 即可）。
 */
export function placeIncrementally(
  map: KnowledgeMap,
  card: { key: string; seed: number; neighbors: Array<{ key: string; similarity: number }> }
): KnowledgeMapNode {
  const byKey = new Map(map.nodes.map(node => [node.key, node]));
  const placed = card.neighbors.filter(n => byKey.has(n.key));
  if (placed.length === 0) {
    let extent = 0;
    for (const node of map.nodes) extent = Math.max(extent, Math.hypot(node.x, node.y));
    const angle = (((card.seed * 2.39996) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    return {
      key: card.key,
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
    const node = byKey.get(neighbor.key)!;
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
  const angle = (((card.seed * 2.39996) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return {
    key: card.key,
    x: x / totalWeight + Math.cos(angle) * 8,
    y: y / totalWeight + Math.sin(angle) * 8,
    topic,
    subtopic,
  };
}
