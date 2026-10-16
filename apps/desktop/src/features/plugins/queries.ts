import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchPluginCatalog,
  fetchPluginRelease,
  stagePluginRelease,
} from "@/commands/plugin-local";
import type { DesktopPluginRuntime } from "@/app/plugins/runtime";

/** 目录随客户端版本由主进程补全；离线时保留上次结果并显示错误。 */
export function usePluginCatalog(query = "") {
  const result = useQuery({
    queryKey: ["plugins", "catalog", query.trim()],
    queryFn: () => fetchPluginCatalog(query),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return {
    data: result.data ?? null,
    loading: result.isPending,
    error: result.error instanceof Error ? result.error.message : result.error ? "读取失败" : "",
    refresh: () => void result.refetch(),
  };
}

export function usePluginRelease(releaseId: string | undefined) {
  return useQuery({
    queryKey: ["plugins", "release", releaseId],
    queryFn: () => fetchPluginRelease(releaseId ?? ""),
    enabled: Boolean(releaseId),
    staleTime: Infinity,
    retry: false,
  });
}

/** 下载并暂存，成功后刷新本地扫描以显示「重启后生效」。 */
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
