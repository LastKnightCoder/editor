/**
 * 项目详情文档树的收起态（zustand + persist）：全局一份，跨项目、跨重启保持。
 * 切换入口在标题栏面包屑（ProjectDetailView），文档树（ProjectList）只读。
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ProjectTreeState {
  collapsed: boolean;
  toggle(): void;
}

export const useProjectTreeStore = create<ProjectTreeState>()(
  persist(
    set => ({
      collapsed: false,
      toggle: () => set(s => ({ collapsed: !s.collapsed })),
    }),
    { name: "tau-project-tree" }
  )
);
