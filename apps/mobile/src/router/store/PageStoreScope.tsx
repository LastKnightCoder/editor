// 页面私有 store（客户端 UI 态）：definePage({ store }) 工厂按实例创建
// zustand vanilla store，生命周期 = 页面实例生命周期（pop 卸载自动 GC）。

import { createContext, useContext, useState, type ReactNode } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import { getPageDefinition } from "../registry";
import type { RouteEntry } from "../core/stackMachine";

type PageStore = StoreApi<Record<string, unknown>>;

const PageStoreContext = createContext<PageStore | null>(null);

export function PageStoreScope({ entry, children }: { entry: RouteEntry; children: ReactNode }) {
  const [store] = useState<PageStore | null>(() => {
    const definition = getPageDefinition(entry.key);
    if (!definition?.store) return null;
    const initial = definition.store(entry.params);
    return createStore<Record<string, unknown>>()(() => initial);
  });
  if (!store) {
    return children;
  }
  return <PageStoreContext.Provider value={store}>{children}</PageStoreContext.Provider>;
}

export function usePageStore<T>(selector: (state: Record<string, unknown>) => T): T {
  const store = useContext(PageStoreContext);
  if (!store) {
    throw new Error("usePageStore 需要页面在 definePage 中声明 store");
  }
  return useStore(store, selector);
}

/** 返回页面 store 的 setState（支持 partial 对象与函数式更新） */
export function usePageStoreSetter(): (
  partial:
    | Partial<Record<string, unknown>>
    | ((prev: Record<string, unknown>) => Partial<Record<string, unknown>>)
) => void {
  const store = useContext(PageStoreContext);
  if (!store) {
    throw new Error("usePageStoreSetter 需要页面在 definePage 中声明 store");
  }
  return store.setState;
}
