import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CardListSort } from "./listModel";

export type CardsViewMode = "wall" | "list" | "database";

/** 按库记忆视图与列表排序；标签筛选走页面参数（侧栏「卡片库」子项），不在此持久化 */
export interface CardsPreferences {
  view: CardsViewMode;
  listSort: CardListSort;
}

export const DEFAULT_CARDS_PREFERENCES: CardsPreferences = {
  view: "wall",
  listSort: "created",
};

interface CardsPreferencesState {
  /** 早于 listSort 存下的条目没有该字段，读取方按 DEFAULT_CARDS_PREFERENCES 补齐 */
  byDatabase: Record<string, Partial<CardsPreferences>>;
  update(databaseName: string, patch: Partial<CardsPreferences>): void;
}

export const useCardsPreferencesStore = create<CardsPreferencesState>()(
  persist(
    set => ({
      byDatabase: {},
      update: (databaseName, patch) =>
        set(state => ({
          byDatabase: {
            ...state.byDatabase,
            [databaseName]: {
              ...DEFAULT_CARDS_PREFERENCES,
              ...state.byDatabase[databaseName],
              ...patch,
            },
          },
        })),
    }),
    {
      name: "tau-cards-preferences",
      version: 2,
      partialize: state => ({ byDatabase: state.byDatabase }),
      /* v0 → v1：标签筛选移到页面参数、页内标签树删除，丢弃 tag / treeCollapsed；
         v1 → v2：「图谱」视图移到全局知识地图（KL-022）回落到卡片墙；分类筛选随卡片分类下线，丢弃 category */
      migrate: persisted => {
        const byDatabase = (persisted as { byDatabase?: Record<string, { view?: CardsViewMode }> })
          ?.byDatabase;
        return {
          byDatabase: Object.fromEntries(
            Object.entries(byDatabase ?? {}).map(([name, { view }]) => [
              name,
              {
                view:
                  (view as string) === "graph" ? "wall" : (view ?? DEFAULT_CARDS_PREFERENCES.view),
              },
            ])
          ),
        };
      },
    }
  )
);
