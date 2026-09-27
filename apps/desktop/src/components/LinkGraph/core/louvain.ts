/**
 * Louvain 社区发现（无权无向图）。
 *
 * 为什么不用连通分量：卡片一旦互相多连几条，整张图就并成一个巨大的分量，
 * 分出来的「簇」没有信息量（批次 1 的实测结果就是一团云）。模块度优化找的是
 * 「内部连得紧、之间连得松」的группы，这才对应人心里的「主题」。
 *
 * 为什么自己实现而不引 graphology：core 层要能整体搬进 Worker，
 * 且需要按分辨率控制粒度（语义缩放要多级），自己写反而更直接。
 *
 * 算法（Blondel 2008）两阶段交替：
 *  1) 局部移动：每个节点试着搬到邻居所在社区，取模块度增益最大的那个；
 *  2) 图聚合：把社区缩成超级节点，回到 1)，直到没有增益。
 * resolution（γ）调粒度：>1 得到更多更小的社区。
 */

/** CSR 邻接表：大图上比数组的数组省内存、也更缓存友好 */
export interface CompactGraph {
  count: number;
  /** 长度 count+1，offsets[i]..offsets[i+1] 是节点 i 的邻居区间 */
  offsets: Int32Array;
  neighbors: Int32Array;
  weights: Float64Array;
  /** 自环权重（聚合后的超级节点才有） */
  selfLoops: Float64Array;
  /** 加权度（含自环 ×2） */
  degrees: Float64Array;
  /** 所有边权之和（每条边算一次） */
  totalWeight: number;
}

export function buildCompactGraph(
  count: number,
  edges: Array<{ source: number; target: number; weight?: number }>
): CompactGraph {
  const degreeCount = new Int32Array(count);
  const selfLoops = new Float64Array(count);
  let totalWeight = 0;

  for (const edge of edges) {
    const weight = edge.weight ?? 1;
    totalWeight += weight;
    if (edge.source === edge.target) {
      selfLoops[edge.source] += weight;
      continue;
    }
    degreeCount[edge.source] += 1;
    degreeCount[edge.target] += 1;
  }

  const offsets = new Int32Array(count + 1);
  for (let i = 0; i < count; i++) offsets[i + 1] = offsets[i] + degreeCount[i];
  const neighbors = new Int32Array(offsets[count]);
  const weights = new Float64Array(offsets[count]);
  const cursor = offsets.slice(0, count);

  for (const edge of edges) {
    if (edge.source === edge.target) continue;
    const weight = edge.weight ?? 1;
    neighbors[cursor[edge.source]] = edge.target;
    weights[cursor[edge.source]++] = weight;
    neighbors[cursor[edge.target]] = edge.source;
    weights[cursor[edge.target]++] = weight;
  }

  const degrees = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    let sum = selfLoops[i] * 2;
    for (let k = offsets[i]; k < offsets[i + 1]; k++) sum += weights[k];
    degrees[i] = sum;
  }

  return { count, offsets, neighbors, weights, selfLoops, degrees, totalWeight };
}

/** 一轮局部移动：返回社区编号（未压缩）与是否发生过移动 */
function localMoving(graph: CompactGraph, resolution: number) {
  const { count, offsets, neighbors, weights, degrees, totalWeight } = graph;
  const community = new Int32Array(count);
  const communityDegree = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    community[i] = i;
    communityDegree[i] = degrees[i];
  }
  if (totalWeight === 0) return { community, improved: false };

  const m2 = totalWeight * 2;
  // 邻居社区权重的稀疏累加器：只清理这一轮碰到的键，避免每个节点 O(count) 清零
  const linkTo = new Float64Array(count);
  const touched: number[] = [];
  let improved = false;

  for (let pass = 0; pass < 20; pass++) {
    let moved = 0;
    for (let node = 0; node < count; node++) {
      const own = community[node];
      const degree = degrees[node];

      touched.length = 0;
      for (let k = offsets[node]; k < offsets[node + 1]; k++) {
        const target = community[neighbors[k]];
        if (linkTo[target] === 0) touched.push(target);
        linkTo[target] += weights[k];
      }

      // 先把自己从原社区摘掉，否则增益里会算上自己的度
      communityDegree[own] -= degree;

      let best = own;
      let bestGain = linkTo[own] - (resolution * communityDegree[own] * degree) / m2;
      for (const candidate of touched) {
        if (candidate === own) continue;
        const gain = linkTo[candidate] - (resolution * communityDegree[candidate] * degree) / m2;
        if (gain > bestGain) {
          bestGain = gain;
          best = candidate;
        }
      }

      communityDegree[best] += degree;
      if (best !== own) {
        community[node] = best;
        moved += 1;
      }
      for (const key of touched) linkTo[key] = 0;
    }
    if (moved === 0) break;
    improved = true;
  }

  return { community, improved };
}

/** 社区编号压缩成 0..k-1，返回社区数 */
function compact(community: Int32Array): number {
  const remap = new Map<number, number>();
  for (let i = 0; i < community.length; i++) {
    let next = remap.get(community[i]);
    if (next === undefined) {
      next = remap.size;
      remap.set(community[i], next);
    }
    community[i] = next;
  }
  return remap.size;
}

/** 按社区聚合成超级图：社区内部的边变自环，跨社区的边合并 */
function aggregate(graph: CompactGraph, community: Int32Array, communityCount: number) {
  const internal = new Float64Array(communityCount);
  const between = new Map<number, number>();
  const { count, offsets, neighbors, weights, selfLoops } = graph;

  for (let node = 0; node < count; node++) {
    const own = community[node];
    internal[own] += selfLoops[node];
    for (let k = offsets[node]; k < offsets[node + 1]; k++) {
      const other = community[neighbors[k]];
      // 邻接表里每条边出现两次，各记一半，内部边正好凑成一条自环权重
      if (other === own) {
        internal[own] += weights[k] / 2;
        continue;
      }
      if (neighbors[k] < node) continue;
      const key = own < other ? own * communityCount + other : other * communityCount + own;
      between.set(key, (between.get(key) ?? 0) + weights[k]);
    }
  }

  const edges: Array<{ source: number; target: number; weight: number }> = [];
  for (let i = 0; i < communityCount; i++) {
    if (internal[i] > 0) edges.push({ source: i, target: i, weight: internal[i] });
  }
  for (const [key, weight] of between) {
    edges.push({
      source: Math.floor(key / communityCount),
      target: key % communityCount,
      weight,
    });
  }
  return buildCompactGraph(communityCount, edges);
}

export interface LouvainResult {
  /** 每个原节点所属社区（0..communityCount-1） */
  membership: Int32Array;
  communityCount: number;
  /** 最终划分的模块度，用于判断结果有没有意义 */
  modularity: number;
}

export function modularityOf(graph: CompactGraph, membership: Int32Array, resolution = 1): number {
  if (graph.totalWeight === 0) return 0;
  const { count, offsets, neighbors, weights, selfLoops, degrees, totalWeight } = graph;
  const m2 = totalWeight * 2;
  const internal = new Map<number, number>();
  const total = new Map<number, number>();
  for (let node = 0; node < count; node++) {
    const own = membership[node];
    total.set(own, (total.get(own) ?? 0) + degrees[node]);
    internal.set(own, (internal.get(own) ?? 0) + selfLoops[node] * 2);
    for (let k = offsets[node]; k < offsets[node + 1]; k++) {
      if (membership[neighbors[k]] === own)
        internal.set(own, (internal.get(own) ?? 0) + weights[k]);
    }
  }
  let q = 0;
  for (const [community, inside] of internal) {
    const tot = total.get(community) ?? 0;
    q += inside / m2 - resolution * (tot / m2) ** 2;
  }
  return q;
}

/**
 * @param resolution 粒度；>1 更碎，<1 更粗。缺省 1 是经典模块度。
 */
export function louvain(graph: CompactGraph, resolution = 1): LouvainResult {
  if (graph.count === 0) {
    return { membership: new Int32Array(0), communityCount: 0, modularity: 0 };
  }
  // 无边图：每个节点自成一簇（孤立卡片的情形，调用方会另行处理）
  if (graph.totalWeight === 0) {
    const membership = new Int32Array(graph.count);
    for (let i = 0; i < graph.count; i++) membership[i] = i;
    return { membership, communityCount: graph.count, modularity: 0 };
  }

  let current = graph;
  let membership = new Int32Array(graph.count);
  for (let i = 0; i < graph.count; i++) membership[i] = i;
  let communityCount = graph.count;

  // 层数上限兜底：正常 3~5 层就收敛
  for (let level = 0; level < 10; level++) {
    const { community, improved } = localMoving(current, resolution);
    const levelCount = compact(community);
    if (!improved || levelCount === current.count) break;

    // 把本层结果折叠回原节点
    const next = new Int32Array(graph.count);
    for (let i = 0; i < graph.count; i++) next[i] = community[membership[i]];
    membership = next;
    communityCount = levelCount;
    current = aggregate(current, community, levelCount);
  }

  return {
    membership,
    communityCount,
    modularity: modularityOf(graph, membership, resolution),
  };
}
