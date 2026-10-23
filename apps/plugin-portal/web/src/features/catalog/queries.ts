import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { comparePluginVersions } from "@tau/plugins/package";
import type {
  CatalogEntry,
  CatalogSort,
  PluginCategory,
  ReleaseSummary,
  ReleasePage,
} from "../../../../contracts";
import type { PortalApi } from "../../api/types";
import { useApi } from "../../app/api";

export const catalogKeys = {
  list: (q: string, category: PluginCategory | null, sort: CatalogSort) =>
    ["catalog", q, category, sort] as const,
  releases: (pluginId: string) => ["plugin-center-v2", "publication-versions", pluginId] as const,
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

/** 提交预检读取全部格式；保留现有页面使用的摘要形状。 */
export async function readPublicationVersions(
  api: PortalApi,
  pluginId: string,
  signal?: AbortSignal
): Promise<ReleasePage> {
  const page = await api.center.listReleases(pluginId, { platform: "all" }, signal);
  return {
    items: page.items.map(release => ({
      id: release.releaseId,
      pluginId: release.pluginId,
      version: release.version,
      state: "published",
      sha256: release.sha256,
      size: release.size,
      error: null,
      publishedAt: release.publishedAt,
      downloadUrl: release.downloadUrl,
      systemReviewed: release.systemReviewed,
      manifest: release.content.manifest,
    })),
    nextCursor: page.nextCursor,
  };
}

/** 服务端按语义版本降序返回，首页覆盖最高版本预检。 */
export function usePluginReleases(pluginId: string | null | undefined) {
  const api = useApi();
  return useQuery({
    queryKey: catalogKeys.releases(pluginId ?? ""),
    queryFn: ({ signal }) => readPublicationVersions(api, pluginId ?? "", signal),
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
