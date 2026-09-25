/**
 * 壳层状态 —— 侧边栏折叠与宽度、右侧辅助栏开合与宽度（zustand + persist，记忆用户偏好）。
 * 唯一可变壳层状态收口在此；导航状态在 page/ 栈机，不混放。
 */

import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const SIDEBAR_MIN_W = 130;
export const SIDEBAR_MAX_W = 340;
/** 收起图标列宽度，与 tokens.css 的 --tau-sidebar-w-collapsed 同源 */
export const SIDEBAR_COLLAPSED_W = 58;
/** 拖拽跨阈值切换：拉宽 ≥ 展开阈值即展开（宽度即时跟随鼠标）；拖窄 ≤ 收起阈值收起。中间 20px 迟滞防边界抖动 */
export const SIDEBAR_EXPAND_W = SIDEBAR_MIN_W;
export const SIDEBAR_COLLAPSE_W = SIDEBAR_MIN_W - 20;

/** 右侧辅助栏（AI 对话停靠栏，D-047）宽度范围与默认值 */
export const ASSIST_MIN_W = 360;
export const ASSIST_MAX_W = 560;
export const ASSIST_DEFAULT_W = 400;

interface ShellState {
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  /** 导航组折叠态（key = 组 label；空对象 = 全展开） */
  navSectionCollapsed: Record<string, boolean>;
  toggleSidebar(): void;
  setSidebarCollapsed(collapsed: boolean): void;
  setSidebarWidth(w: number): void;
  toggleNavSection(label: string): void;
  /** 右侧辅助栏是否打开（Ctrl+J / 标题栏按钮） */
  assistOpen: boolean;
  assistWidth: number;
  /** 侧栏是否因辅助栏空间不足被自动收起：关闭辅助栏时据此还原 */
  sidebarAutoCollapsed: boolean;
  toggleAssist(): void;
  setAssistOpen(open: boolean): void;
  setAssistWidth(w: number): void;
  setSidebarAutoCollapsed(auto: boolean): void;
}

export const useShellStore = create<ShellState>()(
  persist(
    set => ({
      sidebarCollapsed: false,
      sidebarWidth: 218,
      navSectionCollapsed: {},
      assistOpen: false,
      assistWidth: ASSIST_DEFAULT_W,
      sidebarAutoCollapsed: false,
      // 手动切换侧栏即接管：不再在关闭辅助栏时自动还原
      toggleSidebar: () =>
        set(s => ({ sidebarCollapsed: !s.sidebarCollapsed, sidebarAutoCollapsed: false })),
      setSidebarCollapsed: collapsed =>
        set({ sidebarCollapsed: collapsed, sidebarAutoCollapsed: false }),
      setSidebarWidth: w =>
        set({ sidebarWidth: Math.min(SIDEBAR_MAX_W, Math.max(SIDEBAR_MIN_W, Math.round(w))) }),
      toggleNavSection: label =>
        set(s => ({
          navSectionCollapsed: {
            ...s.navSectionCollapsed,
            [label]: !(s.navSectionCollapsed[label] ?? false),
          },
        })),
      toggleAssist: () => set(s => ({ assistOpen: !s.assistOpen })),
      setAssistOpen: open => set({ assistOpen: open }),
      setAssistWidth: w =>
        set({ assistWidth: Math.min(ASSIST_MAX_W, Math.max(ASSIST_MIN_W, Math.round(w))) }),
      setSidebarAutoCollapsed: auto => set({ sidebarAutoCollapsed: auto }),
    }),
    { name: "tau-shell" }
  )
);

/**
 * 进入页面时收起侧栏（改写用户偏好，离开不自动展开）。
 * 保活页经 <Activity> 重新激活时 effect 重跑，每次进入都会收起一次；
 * 页面内用户手动展开不受影响，直到下次进入。
 */
export function useCollapseSidebarOnEnter(enabled: boolean) {
  useEffect(() => {
    if (enabled) useShellStore.getState().setSidebarCollapsed(true);
  }, [enabled]);
}
