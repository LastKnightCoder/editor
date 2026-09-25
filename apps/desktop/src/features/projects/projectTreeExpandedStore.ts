/**
 * 项目文档树条目展开状态（跨项目、跨重启保持，树视图与思维导图共用）。
 * 值语义为「是否展开」，与持久层 key `project-item-${databaseName}-${itemId}`
 * 的历史存储格式（JSON boolean = folderOpen）一致——既有折叠偏好无需迁移即生效；
 * 内存层提供值订阅与批量定位脉冲。
 */

import { create } from "zustand";

const storageKey = (databaseName: string, itemId: number) =>
  `project-item-${databaseName}-${itemId}`;

export const openEntryKey = (databaseName: string, itemId: number) => `${databaseName}:${itemId}`;

/** 持久层回读（store 内存未命中时兜底）——订阅 open 值的组件渲染期调用 */
export const readPersistedOpen = (databaseName: string, itemId: number): boolean | undefined => {
  const raw = window.localStorage.getItem(storageKey(databaseName, itemId));
  if (raw == null) return undefined;
  try {
    return Boolean(JSON.parse(raw));
  } catch {
    return undefined;
  }
};

interface ProjectTreeExpandedState {
  /** `${db}:${id}` -> 是否展开；未命中回读持久层 */
  open: Record<string, boolean>;
  getOpen(databaseName: string, itemId: number): boolean | undefined;
  setOpen(databaseName: string, itemId: number, open: boolean): void;
  /** 定位脉冲：目标及其祖先一次性展开，覆盖此前的折叠意图 */
  batchReveal(databaseName: string, itemIds: Iterable<number>): void;
}

export const useProjectTreeExpandedStore = create<ProjectTreeExpandedState>((set, get) => ({
  open: {},
  getOpen(databaseName, itemId) {
    const cached = get().open[openEntryKey(databaseName, itemId)];
    if (cached !== undefined) return cached;
    return readPersistedOpen(databaseName, itemId);
  },
  setOpen(databaseName, itemId, open) {
    window.localStorage.setItem(storageKey(databaseName, itemId), JSON.stringify(open));
    set(state => ({ open: { ...state.open, [openEntryKey(databaseName, itemId)]: open } }));
  },
  batchReveal(databaseName, itemIds) {
    const next = { ...get().open };
    for (const itemId of itemIds) {
      next[openEntryKey(databaseName, itemId)] = true;
      window.localStorage.setItem(storageKey(databaseName, itemId), JSON.stringify(true));
    }
    set({ open: next });
  },
}));
