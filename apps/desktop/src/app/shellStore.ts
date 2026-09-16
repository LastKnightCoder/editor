/**
 * 壳层状态 —— 侧边栏折叠与宽度（zustand + persist，记忆用户偏好）。
 * 唯一可变壳层状态收口在此；导航状态在 page/ 栈机，不混放。
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export const SIDEBAR_MIN_W = 180;
export const SIDEBAR_MAX_W = 340;

interface ShellState {
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  /** 导航组折叠态（key = 组 label；空对象 = 全展开） */
  navSectionCollapsed: Record<string, boolean>;
  toggleSidebar(): void;
  setSidebarWidth(w: number): void;
  toggleNavSection(label: string): void;
}

export const useShellStore = create<ShellState>()(
  persist(
    set => ({
      sidebarCollapsed: false,
      sidebarWidth: 218,
      navSectionCollapsed: {},
      toggleSidebar: () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarWidth: w =>
        set({ sidebarWidth: Math.min(SIDEBAR_MAX_W, Math.max(SIDEBAR_MIN_W, Math.round(w))) }),
      toggleNavSection: label =>
        set(s => ({
          navSectionCollapsed: {
            ...s.navSectionCollapsed,
            [label]: !(s.navSectionCollapsed[label] ?? false),
          },
        })),
    }),
    { name: "tau-shell" }
  )
);
