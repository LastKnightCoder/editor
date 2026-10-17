import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { PluginPageHandle } from "@tau/plugins";
import type { RuntimeState, WeReadRuntime } from "./runtime";

export interface WeReadPages {
  shelf: PluginPageHandle;
  book: PluginPageHandle;
}

const RuntimeContext = createContext<{ runtime: WeReadRuntime; pages: WeReadPages } | null>(null);

export function RuntimeProvider({
  runtime,
  pages,
  children,
}: {
  runtime: WeReadRuntime;
  pages: WeReadPages;
  children: ReactNode;
}) {
  return (
    <RuntimeContext.Provider value={{ runtime, pages }}>
      <QueryClientProvider client={runtime.queryClient}>{children}</QueryClientProvider>
    </RuntimeContext.Provider>
  );
}

export function useWeRead() {
  const value = useContext(RuntimeContext);
  if (!value) throw new Error("微信读书运行时未就绪");
  return value;
}

export function useWeReadState<T>(select: (state: RuntimeState) => T): T {
  const { runtime } = useWeRead();
  return select(useSyncExternalStore(runtime.subscribe, runtime.getState));
}

/** 单书：连接状态变化后重新加载（未连接读摘录，已连接拉最新） */
export function useBookDetail(bookId: string) {
  const { runtime } = useWeRead();
  const connection = useWeReadState(state => state.connection);
  const loaded = useWeReadState(state => state.loaded);
  const query = useQuery({
    queryKey: ["book", bookId, connection],
    queryFn: () => runtime.loadBook(bookId),
    enabled: loaded && connection !== "checking",
    staleTime: 5 * 60_000,
  });
  return {
    detail: query.data ?? null,
    loading: !loaded || connection === "checking" ? !query.data : query.isPending,
    refreshing: query.isFetching,
    error: query.error,
    refresh: () => void query.refetch(),
  };
}

/** 外部链接：宿主把 http(s) 新窗口交给系统浏览器 */
export function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

/** 定位到某个元素后短暂描边提示；类名写成静态串，Tailwind 才能生成 */
const FLASH_CLASSES = ["ring-2", "ring-accent", "ring-offset-2", "ring-offset-surface"];

export function scrollToAndFlash(el: Element, durationMs = 1600): void {
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add(...FLASH_CLASSES);
  window.setTimeout(() => el.classList.remove(...FLASH_CLASSES), durationMs);
}
