/**
 * 白板素材架的开关（zustand + persist）：全局一份，跨白板、跨重启保持。
 * 开关在白板页面包屑（ShelfToggle），素材架在画布纸面内左侧（MaterialShelf）。
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface WhiteboardShelfState {
  open: boolean;
  toggle(): void;
}

export const useWhiteboardShelfStore = create<WhiteboardShelfState>()(
  persist(
    set => ({
      open: false,
      toggle: () => set(s => ({ open: !s.open })),
    }),
    { name: "tau-whiteboard-shelf", version: 1, partialize: ({ open }) => ({ open }) }
  )
);
