/**
 * Notebook 左栏（资料 + 产物目录）的收起态（zustand + persist）：全局一份，跨项目、跨重启保持。
 * 切换入口在标题栏面包屑（VibeLearningDetailView），目录本身只读。
 *
 * 与项目文档树的收起态分开存：两个模块拆分后共用一个 key 会互相干扰。
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface VibeLearningPanelState {
  collapsed: boolean;
  toggle(): void;
}

export const useVibeLearningPanelStore = create<VibeLearningPanelState>()(
  persist(
    set => ({
      collapsed: false,
      toggle: () => set(s => ({ collapsed: !s.collapsed })),
    }),
    { name: "tau-vibe-learning-panel" }
  )
);
