/**
 * 岔路合并：三路邻居（双链 / 语义相近 / 同标签）按优先级去重并轮流派额。
 * 纯函数，供 useWalkNeighbors 在 select 阶段消费——trail 变化只重算合并、不重查。
 */

import type { WalkNeighbor, WalkRef } from "@/types";

export interface MergeWalkNeighborsInput {
  self: WalkRef;
  links: WalkNeighbor[];
  semantic: WalkNeighbor[];
  tags: WalkNeighbor[];
  /** 本次漫步已走过的足迹 */
  exclude: WalkRef[];
  /** 默认 4 */
  limit?: number;
}

const refKey = (ref: { kind: string; id: number }) => `${ref.kind}:${ref.id}`;

/** 合并三路邻居：去重（同一 ref 保留最高优先级关系）、排除 self 与足迹、
 *  先三类各给一个名额再按 link→semantic→tag 顺序补满，避免被双链挤满 */
export function mergeWalkNeighbors(input: MergeWalkNeighborsInput): WalkNeighbor[] {
  const limit = Math.max(0, input.limit ?? 4);
  if (limit === 0) return [];
  const excluded = new Set([...input.exclude, input.self].map(refKey));
  const seen = new Set<string>();
  const pools = [input.links, input.semantic, input.tags].map(neighbors =>
    neighbors.filter(neighbor => {
      const key = refKey(neighbor.ref);
      if (excluded.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
  );

  const merged: WalkNeighbor[] = [];
  // 第一轮：三类各取 1 条，保证每种关系都有机会出现
  for (const pool of pools) {
    if (merged.length >= limit) break;
    const neighbor = pool.shift();
    if (neighbor) merged.push(neighbor);
  }
  // 第二轮：按 link→semantic→tag 顺序补满
  for (const pool of pools) {
    while (merged.length < limit && pool.length > 0) {
      const neighbor = pool.shift();
      if (neighbor) merged.push(neighbor);
    }
    if (merged.length >= limit) break;
  }
  return merged;
}
