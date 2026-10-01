/** 驾驶舱列表本机偏好：排布与排序，按模块各存一份（归档展开不跨会话保留） */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CockpitLayout, CockpitSort } from "./model";

interface ModulePrefs {
  layout: CockpitLayout;
  sort: CockpitSort;
}

const DEFAULT_PREFS: ModulePrefs = { layout: "grid", sort: "opened" };

interface CockpitPrefsState {
  byModule: Record<string, ModulePrefs>;
  update(module: string, patch: Partial<ModulePrefs>): void;
}

const useCockpitPrefsStore = create<CockpitPrefsState>()(
  persist(
    set => ({
      byModule: {},
      update: (module, patch) =>
        set(state => ({
          byModule: {
            ...state.byModule,
            [module]: { ...DEFAULT_PREFS, ...state.byModule[module], ...patch },
          },
        })),
    }),
    {
      name: "tau-cockpit-prefs",
      partialize: ({ byModule }) => ({ byModule }),
    }
  )
);

export function useCockpitPrefs(module: string): ModulePrefs & {
  setLayout(layout: CockpitLayout): void;
  setSort(sort: CockpitSort): void;
} {
  const prefs = useCockpitPrefsStore(state => state.byModule[module]) ?? DEFAULT_PREFS;
  const update = useCockpitPrefsStore(state => state.update);
  return {
    ...prefs,
    setLayout: layout => update(module, { layout }),
    setSort: sort => update(module, { sort }),
  };
}
