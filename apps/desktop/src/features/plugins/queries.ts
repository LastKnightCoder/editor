import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchPluginCatalog,
  fetchPluginRelease,
  fetchPluginVersions,
  stagePluginRelease,
  fetchPluginCommunity,
  setPluginLiked,
  addPluginComment,
  deletePluginComment,
} from "@/commands/plugin-local";
import type { DesktopPluginRuntime } from "@/app/plugins/runtime";
import type { PluginCatalogSort } from "@/types/plugin-center";

export function usePluginCommunity(pluginId: string) {
  const client = useQueryClient();
  const queryKey = ["plugins", "community", pluginId];
  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchPluginCommunity(pluginId, pageParam),
    getNextPageParam: page => page.nextCursor ?? undefined,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const refresh = () => client.invalidateQueries({ queryKey });
  const like = useMutation({
    mutationFn: (liked: boolean) => setPluginLiked(pluginId, liked),
    onSuccess: refresh,
  });
  const comment = useMutation({
    mutationFn: (input: { message: string; requestId: string }) =>
      addPluginComment(pluginId, input.message, input.requestId),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (commentId: string) => deletePluginComment(pluginId, commentId),
    onSuccess: refresh,
  });
  return { query, like, comment, remove };
}

/** 目录随客户端版本由主进程补全；离线时保留上次结果并显示错误。 */
export function usePluginCatalog(query = "", sort: PluginCatalogSort = "downloads7d") {
  const result = useQuery({
    queryKey: ["plugins", "catalog", query.trim(), sort],
    queryFn: () => fetchPluginCatalog(query, sort),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  return {
    data: result.data ?? null,
    loading: result.isPending,
    error: result.error instanceof Error ? result.error.message : result.error ? "读取失败" : "",
    refresh: () => void result.refetch(),
  };
}

/** 发布记录不可变；详情页展示与安装前的后台判定共用同一缓存。 */
export const pluginReleaseQuery = (releaseId: string | undefined) => ({
  queryKey: ["plugins", "release", releaseId],
  queryFn: () => fetchPluginRelease(releaseId ?? ""),
  staleTime: Infinity,
  retry: false,
});

export function usePluginRelease(releaseId: string | undefined) {
  return useQuery({ ...pluginReleaseQuery(releaseId), enabled: Boolean(releaseId) });
}

/** 中心已发布版本；随详情页打开读取，不随窗口聚焦刷新。 */
export function usePluginVersions(pluginId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["plugins", "versions", pluginId],
    queryFn: () => fetchPluginVersions(pluginId),
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** 下载并安装后刷新本地登记；需要更新内容快照的包保留为待生效。 */
export function useInstallRelease(runtime: DesktopPluginRuntime | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (releaseId: string) => {
      const staged = await stagePluginRelease(releaseId);
      await runtime?.local?.refresh();
      return staged;
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["plugins", "catalog"] }),
  });
}
