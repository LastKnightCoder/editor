/**
 * 白板元素树停靠栏的开关与宽度（zustand + persist）：全局一份，跨白板、跨重启保持。
 * 切换入口在标题栏面包屑（WhiteboardDetailView），停靠栏（Sidebar）只读开关、可改宽度。
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface WhiteboardOutlineState {
  open: boolean;
  width: number;
  toggle(): void;
  setWidth(width: number): void;
}

export const useWhiteboardOutlineStore = create<WhiteboardOutlineState>()(
  persist(
    set => ({
      open: false,
      width: 260,
      toggle: () => set(s => ({ open: !s.open })),
      setWidth: width => set({ width }),
    }),
    { name: "tau-whiteboard-outline", version: 1 }
  )
);
