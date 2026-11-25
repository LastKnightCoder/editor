// 功能入口的用户排序：「我的」功能宫格与平板左导航条共用这一份顺序，记在本机。

import { create } from "zustand";

const STORAGE_KEY = "tau-mobile-feature-order";

function readStored(): string[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === "string") : [];
  } catch {
    return [];
  }
}

type FeatureOrderState = {
  order: string[];
  /** keys 为当前可见入口的新顺序；暂时不可见的（插件停用中）记在末尾，重新启用时回到原处附近 */
  save: (keys: readonly string[]) => void;
};

export const useFeatureOrder = create<FeatureOrderState>((set, get) => ({
  order: readStored(),
  save(keys) {
    const visible = new Set(keys);
    const next = [...keys, ...get().order.filter(key => !visible.has(key))];
    set({ order: next });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // localStorage 不可用时本次会话内仍生效
    }
  },
}));

/** 排过序的在前、按记录的顺序；没排过的（新启用的插件、新增的内置功能）按默认顺序接在后面 */
export function sortByFeatureOrder<T extends { key: string }>(
  items: readonly T[],
  order: readonly string[]
): T[] {
  const rank = new Map(order.map((key, index) => [key, index]));
  return items
    .map((item, index) => ({ item, index, rank: rank.get(item.key) }))
    .sort((a, b) => {
      if (a.rank !== undefined && b.rank !== undefined) return a.rank - b.rank;
      if (a.rank !== undefined) return -1;
      if (b.rank !== undefined) return 1;
      return a.index - b.index;
    })
    .map(entry => entry.item);
}
