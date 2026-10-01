import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CardFilter } from "./types";

export type CardsViewMode = "wall" | "database";

/** 按库记忆视图与分类；标签筛选走页面参数（侧栏「卡片库」子项），不在此持久化 */
interface CardsPreferences extends Pick<CardFilter, "category"> {
  view: CardsViewMode;
}

export const DEFAULT_CARDS_PREFERENCES: CardsPreferences = {
  view: "wall",
  category: "all",
};

interface CardsPreferencesState {
  byDatabase: Record<string, CardsPreferences>;
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
              ...(state.byDatabase[databaseName] ?? DEFAULT_CARDS_PREFERENCES),
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
         v1 → v2：「图谱」视图移到全局知识地图（KL-022），存量回落到卡片墙 */
      migrate: persisted => {
        const byDatabase = (persisted as { byDatabase?: Record<string, CardsPreferences> })
          ?.byDatabase;
        return {
          byDatabase: Object.fromEntries(
            Object.entries(byDatabase ?? {}).map(([name, { view, category }]) => [
              name,
              { view: (view as string) === "graph" ? "wall" : view, category },
            ])
          ),
        };
      },
    }
  )
);
