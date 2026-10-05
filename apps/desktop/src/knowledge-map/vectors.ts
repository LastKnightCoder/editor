/**
 * 卡片级向量与语义近邻。
 *
 * 索引库里一张卡按分块存了多条向量（smartChunk）。知识地图需要「一张卡一个点」，
 * 取分块均值再归一化：均值保留了整张卡的主旨，归一化后内积就是余弦相似度，
 * kNN 只需要点积，不用每次再算范数。
 */

export interface CardVector {
  id: number;
  /** 已归一化（L2 = 1） */
  vector: Float32Array;
}

/** 分块向量 → 卡片向量（均值 + 归一化）；输入按卡片 id 分组 */
export function meanPool(chunks: Map<number, Float32Array[]>): CardVector[] {
  const result: CardVector[] = [];
  for (const [id, list] of chunks) {
    if (list.length === 0) continue;
    const dim = list[0].length;
    const sum = new Float32Array(dim);
    let usable = 0;
    for (const chunk of list) {
      // 维度对不上的分块来自换模型前的残留，丢掉而不是污染均值
      if (chunk.length !== dim) continue;
      for (let i = 0; i < dim; i++) sum[i] += chunk[i];
      usable += 1;
    }
    if (usable === 0) continue;
    let norm = 0;
    for (let i = 0; i < dim; i++) norm += sum[i] * sum[i];
    norm = Math.sqrt(norm);
    // 零向量（空卡片的退化 embedding）没有方向，不参与语义近邻
    if (norm < 1e-9) continue;
    for (let i = 0; i < dim; i++) sum[i] /= norm;
    result.push({ id, vector: sum });
  }
  // 按 id 排序：输出与输入 Map 的插入顺序无关，结果可复现
  result.sort((a, b) => a.id - b.id);
  return result;
}

export interface Neighbor {
  /** 在 vectors 数组里的下标 */
  index: number;
  similarity: number;
}

/**
 * 暴力 kNN（精确）。
 *
 * 三个关键优化，都是为了万级规模（2 万张的裸实现要 5 分钟，见压测）：
 *  1. **只算上三角**：余弦相似度对称，算一次同时喂给两端，乘加次数减半；
 *  2. **向量打包成一块连续内存**：原本每张卡一个独立 Float32Array，
 *     内循环跨对象访问，缓存命中差；打包后内层是顺序读；
 *  3. **点积按 4 路展开**：减少循环开销，也让引擎更容易用 SIMD。
 *
 * 为什么仍不上 ANN：结果精确（ANN 的近似误差会让主题边界抖动），
 * 而这是离线一次性成本。真到十万级再换 HNSW，调用方不受影响。
 *
 * @param minSimilarity 低于它的不算邻居：语义上八竿子打不着的卡片硬连上，
 *   只会把孤立卡片拽进随便哪个簇
 */
export function knn(vectors: CardVector[], k: number, minSimilarity = 0.35): Neighbor[][] {
  const count = vectors.length;
  const result: Neighbor[][] = Array.from({ length: count }, () => []);
  if (count < 2 || k <= 0) return result;
  const dim = vectors[0].vector.length;

  // 打包：第 i 个向量占 [i*dim, (i+1)*dim)
  const flat = new Float32Array(count * dim);
  for (let i = 0; i < count; i++) {
    const v = vectors[i].vector;
    // 维度不一致的（换模型后的残留）留成零向量：点积恒为 0，自然不会成为邻居
    if (v.length === dim) flat.set(v, i * dim);
  }

  /** 每个点一个「最弱在头」的升序缓冲，长度上限 k；插入时保持有序 */
  const tops: Neighbor[][] = result;
  const offer = (owner: number, index: number, similarity: number) => {
    const top = tops[owner];
    if (top.length < k) {
      top.push({ index, similarity });
      // 装满时排一次，之后靠插入维持有序
      if (top.length === k) top.sort((x, y) => x.similarity - y.similarity);
      return;
    }
    if (similarity <= top[0].similarity) return;
    top[0] = { index, similarity };
    for (let p = 0; p + 1 < top.length && top[p].similarity > top[p + 1].similarity; p++) {
      const tmp = top[p];
      top[p] = top[p + 1];
      top[p + 1] = tmp;
    }
  };

  const tail = dim - (dim % 4);
  for (let i = 0; i < count; i++) {
    const base = i * dim;
    for (let j = i + 1; j < count; j++) {
      const other = j * dim;
      let d0 = 0;
      let d1 = 0;
      let d2 = 0;
      let d3 = 0;
      for (let d = 0; d < tail; d += 4) {
        d0 += flat[base + d] * flat[other + d];
        d1 += flat[base + d + 1] * flat[other + d + 1];
        d2 += flat[base + d + 2] * flat[other + d + 2];
        d3 += flat[base + d + 3] * flat[other + d + 3];
      }
      let dot = d0 + d1 + d2 + d3;
      for (let d = tail; d < dim; d++) dot += flat[base + d] * flat[other + d];
      if (dot < minSimilarity) continue;
      offer(i, j, dot);
      offer(j, i, dot);
    }
  }

  for (let i = 0; i < count; i++) {
    tops[i].sort((x, y) => y.similarity - x.similarity || x.index - y.index);
  }
  return result;
}

/**
 * 去枢纽：每个向量最多被 cap 个向量选作近邻，超出时只保留相似度最高的入边。
 *
 * 多分块的长文取均值后落在语义空间的中心，会被大量节点选中（真实库里一篇文章被 147 个节点选中），
 * 成为到处都连的「假桥」，把卡片之间本来的语义结构挤掉。限制入度后长文仍和最像的那些节点相连。
 */
export function capInDegree(neighbors: Neighbor[][], cap: number): Neighbor[][] {
  const incoming = new Map<number, Array<{ from: number; similarity: number }>>();
  neighbors.forEach((list, from) => {
    for (const { index, similarity } of list) {
      const arr = incoming.get(index);
      if (arr) arr.push({ from, similarity });
      else incoming.set(index, [{ from, similarity }]);
    }
  });
  const dropped = new Set<string>();
  for (const [to, arr] of incoming) {
    if (arr.length <= cap) continue;
    arr.sort((a, b) => b.similarity - a.similarity || a.from - b.from);
    for (const edge of arr.slice(cap)) dropped.add(`${edge.from}>${to}`);
  }
  if (dropped.size === 0) return neighbors;
  return neighbors.map((list, from) => list.filter(n => !dropped.has(`${from}>${n.index}`)));
}
