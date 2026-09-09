// 页面数据层（服务端状态）：definePage({ data }) 声明 + usePageQuery 消费。
// query key 以页面 params 参数化 → 每实例独立缓存；返回页面时
// 按 refetchOnResume 声明刷新（stale-while-revalidate 恢复语义）。

import { useEffect, useRef, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { getPageDefinition } from "../registry";
import { usePageInstanceContext } from "../pageLifecycle";

const DEFAULT_STALE_TIME = 30_000;
const DEFAULT_GC_TIME = 5 * 60_000;

// App 级共享单例：AppShell 的跨页面操作（删除卡片后失效预览缓存等）经此访问
let sharedQueryClient: QueryClient | null = null;

export function getQueryClient(): QueryClient {
  if (!sharedQueryClient) {
    sharedQueryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: DEFAULT_STALE_TIME,
          gcTime: DEFAULT_GC_TIME,
          refetchOnWindowFocus: false,
          retry: 1,
        },
      },
    });
  }
  return sharedQueryClient;
}

export function PageQueryProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}

type ResolvedPageDataEntry = {
  key: (params: Record<string, unknown>) => readonly unknown[];
  load: (params: Record<string, unknown>, ctx: { signal: AbortSignal }) => Promise<unknown>;
  enabled?: (params: Record<string, unknown>) => boolean;
  staleTime?: number;
  gcTime?: number;
  refetchOnResume?: "if-stale" | "always" | "never";
};

export function usePageQuery<Data = unknown>(dataKey: string) {
  const ctx = usePageInstanceContext();
  const definition = getPageDefinition(ctx.entry.key);
  const entry = definition?.data?.[dataKey] as ResolvedPageDataEntry | undefined;
  if (!entry) {
    throw new Error(`[router] 页面 ${ctx.entry.key} 未声明 data.${String(dataKey)}`);
  }
  const params = ctx.params;

  const query = useQuery({
    queryKey: [...entry.key(params), ctx.entry.key, dataKey],
    queryFn: ({ signal }) => entry.load(params, { signal }) as Promise<Data>,
    enabled: entry.enabled ? entry.enabled(params) : true,
    staleTime: entry.staleTime ?? DEFAULT_STALE_TIME,
    gcTime: entry.gcTime ?? DEFAULT_GC_TIME,
  });

  // 声明式"返回时刷新"：phase paused → active 时按策略重取
  const refetchOnResume = entry.refetchOnResume ?? "if-stale";
  const prevPhaseRef = useRef(ctx.phase);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = ctx.phase;
    if (prev !== "paused" || ctx.phase !== "active") return;
    if (refetchOnResume === "never") return;
    if (refetchOnResume === "always" || query.isStale) {
      void query.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.phase, refetchOnResume]);

  return query;
}
