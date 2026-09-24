import { create } from "zustand";
import { persist } from "zustand/middleware";
import { produce } from "immer";
import { TabType, TabParams } from "@/types/tab";

/**
 * 导航历史记录项
 */
export interface INavigationHistoryItem {
  type: TabType;
  params?: unknown;
  title: string;
  timestamp: number;
  count: number; // 访问次数
}

interface IState {
  history: INavigationHistoryItem[];
}

interface IActions {
  addToHistory: <T extends TabType>(type: T, params?: TabParams[T], title?: string) => void;
  clearHistory: () => void;
  getRecentItems: (limit?: number) => INavigationHistoryItem[];
  getFrequentItems: (limit?: number) => INavigationHistoryItem[];
  removeFromHistory: (type: TabType, params?: unknown) => void;
}

const MAX_HISTORY_ITEMS = 50;

const initialState: IState = {
  history: [],
};

const NAVIGATION_HISTORY_STORE_VERSION = 4;

const migrateNavigationHistoryState = (persistedState: unknown): IState => {
  if (!persistedState || typeof persistedState !== "object") {
    return initialState;
  }

  const state = persistedState as Partial<IState>;
  const history = Array.isArray(state.history)
    ? state.history.filter(item => {
        const type = item.type as string;
        return type !== "resourceManagement" && type !== "goals" && type !== "dataView";
      })
    : [];

  return { history };
};

const useNavigationHistoryStore = create<IState & IActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      addToHistory: <T extends TabType>(type: T, params?: TabParams[T], title?: string) => {
        set(
          produce((state: IState) => {
            // 查找是否已存在相同的记录
            const existingIndex = state.history.findIndex(
              item => item.type === type && JSON.stringify(item.params) === JSON.stringify(params)
            );

            if (existingIndex !== -1) {
              // 如果存在，更新访问次数和时间戳
              const existing = state.history[existingIndex];
              existing.count += 1;
              existing.timestamp = Date.now();
              if (title) {
                existing.title = title;
              }
            } else {
              // 如果不存在，添加新记录
              state.history.push({
                type,
                params,
                title: title || "",
                timestamp: Date.now(),
                count: 1,
              });
            }

            // 按时间戳排序（最新的在前）
            state.history.sort((a, b) => b.timestamp - a.timestamp);

            // 保持 LRU，只保留最近的 MAX_HISTORY_ITEMS 条
            if (state.history.length > MAX_HISTORY_ITEMS) {
              // 保留访问次数最多的和最近的
              const sortedByCount = [...state.history].sort((a, b) => b.count - a.count);
              const sortedByTime = [...state.history].sort((a, b) => b.timestamp - a.timestamp);

              // 取前 40 个最常访问的和前 40 个最近访问的，去重
              const topByCount = sortedByCount.slice(0, 40);
              const topByTime = sortedByTime.slice(0, 40);
              const combined = [...topByCount];

              topByTime.forEach(item => {
                if (
                  !combined.some(
                    c =>
                      c.type === item.type &&
                      JSON.stringify(c.params) === JSON.stringify(item.params)
                  )
                ) {
                  combined.push(item);
                }
              });

              state.history = combined.slice(0, MAX_HISTORY_ITEMS);
            }
          })
        );
      },

      clearHistory: () => {
        set({ history: [] });
      },

      getRecentItems: (limit = 10) => {
        const { history } = get();
        return [...history].sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
      },

      getFrequentItems: (limit = 10) => {
        const { history } = get();
        return [...history]
          .sort((a, b) => {
            // 综合考虑访问次数和时间，时间越近权重越高
            const now = Date.now();
            const daysSinceA = (now - a.timestamp) / (1000 * 60 * 60 * 24);
            const daysSinceB = (now - b.timestamp) / (1000 * 60 * 60 * 24);

            // 时间衰减因子（越近权重越高）
            const timeDecayA = Math.exp(-daysSinceA / 30); // 30 天衰减
            const timeDecayB = Math.exp(-daysSinceB / 30);

            const scoreA = a.count * timeDecayA;
            const scoreB = b.count * timeDecayB;

            return scoreB - scoreA;
          })
          .slice(0, limit);
      },

      removeFromHistory: (type: TabType, params?: unknown) => {
        set(
          produce((state: IState) => {
            const index = state.history.findIndex(
              item => item.type === type && JSON.stringify(item.params) === JSON.stringify(params)
            );
            if (index !== -1) {
              state.history.splice(index, 1);
            }
          })
        );
      },
    }),
    {
      name: "navigation-history-store",
      version: NAVIGATION_HISTORY_STORE_VERSION,
      migrate: persistedState => migrateNavigationHistoryState(persistedState),
      partialize: state => ({
        history: state.history,
      }),
    }
  )
);

export default useNavigationHistoryStore;
