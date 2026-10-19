import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { comparePluginVersions } from "@tau/plugins/package";
import type {
  CatalogEntry,
  CatalogSort,
  PluginCategory,
  ReleaseSummary,
} from "../../../../contracts";
import { useApi } from "../../app/api";

export const catalogKeys = {
  list: (q: string, category: PluginCategory | null, sort: CatalogSort) =>
    ["catalog", q, category, sort] as const,
  releases: (pluginId: string) => ["plugin-releases", pluginId] as const,
  release: (id: string) => ["release", id] as const,
  stats: (pluginId: string) => ["plugin-stats", pluginId] as const,
};

export function useCatalog(q: string, category: PluginCategory | null, sort: CatalogSort) {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: catalogKeys.list(q, category, sort),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.getCatalog({ q, category, sort, cursor: pageParam }),
    getNextPageParam: page => page.nextCursor ?? undefined,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

/** 翻页时榜单可能变化，按 pluginId 去重 */
export function uniqueEntries(pages: { items: CatalogEntry[] }[] | undefined): CatalogEntry[] {
  return [
    ...new Map(pages?.flatMap(page => page.items).map(entry => [entry.pluginId, entry])).values(),
  ];
}

/** 某插件最近发布的一页版本（20 条），足够覆盖版本历史展示与审核对比 */
export function usePluginReleases(pluginId: string | null | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: catalogKeys.releases(pluginId ?? ""),
    queryFn: () => api.listReleases(pluginId ?? "", null),
    enabled: !!pluginId,
    staleTime: 60_000,
  });
}

export function useRelease(id: string | null | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: catalogKeys.release(id ?? ""),
    queryFn: () => api.getRelease(id ?? ""),
    enabled: !!id,
    staleTime: 5 * 60_000,
  });
}

export function usePluginStats(pluginId: string) {
  const api = useApi();
  return useQuery({
    queryKey: catalogKeys.stats(pluginId),
    queryFn: () => api.getPluginStats(pluginId),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}

/** 按 SemVer 取最高版本（发布时间不代表版本高低） */
export function highestRelease(items: ReleaseSummary[] | undefined): ReleaseSummary | null {
  return (items ?? []).reduce<ReleaseSummary | null>(
    (best, item) => (!best || comparePluginVersions(item.version, best.version) > 0 ? item : best),
    null
  );
}

export function sortByVersionDesc(items: ReleaseSummary[] | undefined): ReleaseSummary[] {
  return [...(items ?? [])].sort((a, b) => comparePluginVersions(b.version, a.version));
}
