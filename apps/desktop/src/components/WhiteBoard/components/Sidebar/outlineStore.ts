/**
 * 白板元素树停靠栏的开关与宽度（zustand + persist）：全局一份，跨白板、跨重启保持。
 * 切换入口在标题栏面包屑（WhiteboardDetailView），停靠栏（Sidebar）只读开关、可改宽度。
 * dockWidth = 停靠栏此刻的实际占宽（含展开 / 收起动画中间帧，收起为 0），不持久化——
 * 宿主页面据此把纸内左下的浮动件（页签条）让到停靠栏右侧。
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface WhiteboardOutlineState {
  open: boolean;
  width: number;
  dockWidth: number;
  toggle(): void;
  setWidth(width: number): void;
  setDockWidth(width: number): void;
}

export const useWhiteboardOutlineStore = create<WhiteboardOutlineState>()(
  persist(
    set => ({
      open: false,
      width: 260,
      dockWidth: 0,
      toggle: () => set(s => ({ open: !s.open })),
      setWidth: width => set({ width }),
      setDockWidth: dockWidth => set({ dockWidth }),
    }),
    {
      name: "tau-whiteboard-outline",
      version: 1,
      partialize: ({ open, width }) => ({ open, width }),
    }
  )
);
