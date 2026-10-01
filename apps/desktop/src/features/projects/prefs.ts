/** 项目列表本机偏好：排布与排序（归档展开不跨会话保留） */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ProjectLayout, ProjectSort } from "./model";

interface ProjectPrefs {
  layout: ProjectLayout;
  sort: ProjectSort;
  setLayout: (layout: ProjectLayout) => void;
  setSort: (sort: ProjectSort) => void;
}

export const useProjectPrefs = create<ProjectPrefs>()(
  persist(
    set => ({
      layout: "grid",
      sort: "opened",
      setLayout: layout => set({ layout }),
      setSort: sort => set({ sort }),
    }),
    {
      name: "tau-project-prefs",
      partialize: ({ layout, sort }) => ({ layout, sort }),
    }
  )
);
