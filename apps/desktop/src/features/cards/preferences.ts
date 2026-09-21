import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CardFilter } from "./types";

export type CardsViewMode = "wall" | "graph" | "database";

interface CardsPreferences extends CardFilter {
  view: CardsViewMode;
  /** 标签树面板收起（wall / graph 视图共用，跨会话记忆） */
  treeCollapsed: boolean;
}

export const DEFAULT_CARDS_PREFERENCES: CardsPreferences = {
  view: "wall",
  category: "all",
  tag: "",
  treeCollapsed: false,
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
      partialize: state => ({ byDatabase: state.byDatabase }),
    }
  )
);
