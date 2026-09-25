/**
 * 「全部会话」弹窗开闭态：侧栏子项的入口与对话页内挂载的弹窗共享（域内私有）。
 */

import { create } from "zustand";

interface ChatLibraryState {
  open: boolean;
  setOpen(open: boolean): void;
}

export const useChatLibraryStore = create<ChatLibraryState>()(set => ({
  open: false,
  setOpen: open => set({ open }),
}));
