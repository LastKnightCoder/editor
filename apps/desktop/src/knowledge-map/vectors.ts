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
 * 暴力 kNN。
 * 为什么不上 ANN：700 张卡 × 1024 维 ≈ 5 亿次乘加，Node 里 1 秒内；
 * 2 万张卡约 4000 亿次，离线跑可以接受，且结果精确（ANN 的近似误差会让
 * 主题边界抖动）。真到 10 万级再换 HNSW，调用方不受影响。
 *
 * @param minSimilarity 低于它的不算邻居：语义上八竿子打不着的卡片硬连上，
 *   只会把孤立卡片拽进随便哪个簇
 */
export function knn(vectors: CardVector[], k: number, minSimilarity = 0.35): Neighbor[][] {
  const count = vectors.length;
  const result: Neighbor[][] = Array.from({ length: count }, () => []);
  if (count < 2 || k <= 0) return result;
  const dim = vectors[0].vector.length;

  // 每个点维护一个大小为 k 的「最弱在头」的有序缓冲，避免对全部 n 个相似度排序
  for (let i = 0; i < count; i++) {
    const a = vectors[i].vector;
    const top: Neighbor[] = [];
    for (let j = 0; j < count; j++) {
      if (i === j) continue;
      const b = vectors[j].vector;
      let dot = 0;
      for (let d = 0; d < dim; d++) dot += a[d] * b[d];
      if (dot < minSimilarity) continue;
      if (top.length < k) {
        top.push({ index: j, similarity: dot });
        if (top.length === k) top.sort((x, y) => x.similarity - y.similarity);
        continue;
      }
      if (dot <= top[0].similarity) continue;
      // 插入到正确位置，保持升序
      top[0] = { index: j, similarity: dot };
      for (let p = 0; p + 1 < top.length && top[p].similarity > top[p + 1].similarity; p++) {
        const tmp = top[p];
        top[p] = top[p + 1];
        top[p + 1] = tmp;
      }
    }
    top.sort((x, y) => y.similarity - x.similarity || x.index - y.index);
    result[i] = top;
  }
  return result;
}
