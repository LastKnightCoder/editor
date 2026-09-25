/**
 * 项目文档树条目折叠状态（跨项目、跨重启保持，树视图与思维导图共用）。
 * 存储后端沿用历史 key `project-item-${databaseName}-${itemId}`（JSON boolean），
 * 旧折叠偏好无需迁移即生效；内存层提供订阅与批量定位脉冲。
 */

import { create } from "zustand";

const legacyKey = (databaseName: string, itemId: number) =>
  `project-item-${databaseName}-${itemId}`;

const entryKey = (databaseName: string, itemId: number) => `${databaseName}:${itemId}`;

interface ProjectTreeExpandedState {
  /** `${db}:${id}` -> 是否折叠；未命中回读旧 key */
  folded: Record<string, boolean>;
  getFolded(databaseName: string, itemId: number): boolean | undefined;
  setFolded(databaseName: string, itemId: number, folded: boolean): void;
  /** 定位脉冲：目标及其祖先一次性展开，覆盖此前的折叠意图 */
  batchReveal(databaseName: string, itemIds: Iterable<number>): void;
}

export const useProjectTreeExpandedStore = create<ProjectTreeExpandedState>((set, get) => ({
  folded: {},
  getFolded(databaseName, itemId) {
    const cached = get().folded[entryKey(databaseName, itemId)];
    if (cached !== undefined) return cached;
    const raw = window.localStorage.getItem(legacyKey(databaseName, itemId));
    if (raw == null) return undefined;
    try {
      return Boolean(JSON.parse(raw));
    } catch {
      return undefined;
    }
  },
  setFolded(databaseName, itemId, folded) {
    window.localStorage.setItem(legacyKey(databaseName, itemId), JSON.stringify(folded));
    set(state => ({ folded: { ...state.folded, [entryKey(databaseName, itemId)]: folded } }));
  },
  batchReveal(databaseName, itemIds) {
    const next = { ...get().folded };
    for (const itemId of itemIds) {
      next[entryKey(databaseName, itemId)] = false;
      window.localStorage.setItem(legacyKey(databaseName, itemId), JSON.stringify(false));
    }
    set({ folded: next });
  },
}));
