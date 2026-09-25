import { create } from "zustand";

// 文档树拖拽进行中信号：拖拽期间挂起编辑器自动保存，
// 避免树移动与保存对同一条目的并发写
interface IDraggingState {
  dragging: boolean;
}

export const useDraggingStore = create<IDraggingState>(() => ({
  dragging: false,
}));
