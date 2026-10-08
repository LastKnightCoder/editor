/**
 * 文档阅读纸的状态。
 * - 摆放方式（居中 / 停靠右侧）是全局偏好，记住上一次的选择；
 * - 当前展开的元素按白板实例隔离（保活页、编辑器内嵌白板可能同时挂着多块画布）。
 */

import { create, useStore } from "zustand";
import { persist } from "zustand/middleware";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { Board } from "@tau/whiteboard";

export type DocumentReaderMode = "center" | "dock";

export const useDocumentReaderPreference = create<{
  mode: DocumentReaderMode;
  setMode(mode: DocumentReaderMode): void;
}>()(
  persist(
    set => ({
      mode: "center",
      setMode: mode => set({ mode }),
    }),
    { name: "tau-whiteboard-document-reader", version: 1, partialize: ({ mode }) => ({ mode }) }
  )
);

interface OpenState {
  /** 展开中的文档元素 id；收起动画期间仍保留，动画结束才清空 */
  openId: string | null;
  closing: boolean;
}

const stores = new WeakMap<Board, StoreApi<OpenState>>();

export function getDocumentReaderStore(board: Board) {
  let store = stores.get(board);
  if (!store) {
    store = createStore<OpenState>(() => ({ openId: null, closing: false }));
    stores.set(board, store);
  }
  return store;
}

export function useDocumentReaderState<T>(board: Board, selector: (state: OpenState) => T): T {
  return useStore(getDocumentReaderStore(board), selector);
}
