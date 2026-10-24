import { useSyncExternalStore } from "react";
import {
  queryOptions,
  useInfiniteQuery,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  normalizeCenterQuery,
  type CenterCatalogQuery,
  type CenterPlatform,
  type CenterResolution,
} from "@tau/plugins/center";
import {
  createMobilePluginCenterClient,
  readMobileCenterConfig,
  type MobileCenterConfig,
} from "../../../services/pluginCenter";
import { getMobileCenterInstallStore } from "../../../app/plugins/center-install";
import { comparePluginVersions } from "@tau/plugins/package";

const client = createMobilePluginCenterClient();
export const mobileCenterKeys = {
  root: ["mobile-plugin-center"] as const,
  config: ["mobile-plugin-center", "config"] as const,
};
export function useMobileCenterConfig() {
  return useQuery({
    queryKey: mobileCenterKeys.config,
    queryFn: readMobileCenterConfig,
    staleTime: 60_000,
  });
}
export function useMobileCenterCatalog(
  filters: Omit<CenterCatalogQuery, "host" | "cursor" | "platform"> & {
    platform?: CenterPlatform;
  } = {}
) {
  const config = useMobileCenterConfig();
  const host = config.data?.host;
  const platform = filters.platform ?? host?.platform ?? "all";
  const input = normalizeCenterQuery({
    ...filters,
    platform,
    ...(host && host.platform === platform ? { host } : {}),
  });
  const query = useInfiniteQuery({
    queryKey: [...mobileCenterKeys.root, "catalog", config.data?.origin ?? null, input],
    enabled: !!config.data,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      client.queryCatalog({ ...input, cursor: pageParam }, signal),
    getNextPageParam: page => page.nextCursor ?? undefined,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  return { config, query };
}
export function useMobileCenterRelease(releaseId: string | null) {
  const config = useMobileCenterConfig();
  return useQuery({
    queryKey: [...mobileCenterKeys.root, "release", config.data?.origin ?? null, releaseId],
    enabled: !!config.data && !!releaseId,
    queryFn: ({ signal }) => {
      if (!releaseId) throw new Error("缺少版本标识");
      return client.getRelease(releaseId, signal);
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}
export function useMobileCenterVersions(pluginId: string, platform: CenterPlatform) {
  const config = useMobileCenterConfig();
  return useInfiniteQuery({
    queryKey: [
      ...mobileCenterKeys.root,
      "versions",
      config.data?.origin ?? null,
      pluginId,
      platform,
    ],
    enabled: !!config.data && !!pluginId,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      client.listReleases(pluginId, { platform, cursor: pageParam }, signal),
    getNextPageParam: page => page.nextCursor ?? undefined,
  });
}
/** 选版查询：单插件详情与已安装列表的批量更新检查共用同一缓存键。 */
const resolutionQuery = (
  config: MobileCenterConfig | undefined,
  pluginId: string,
  releaseId?: string,
  enabled = true
) => {
  const host = config?.host;
  return queryOptions({
    queryKey: [
      ...mobileCenterKeys.root,
      "resolve",
      config?.origin ?? null,
      host ?? null,
      pluginId,
      releaseId ?? null,
    ],
    enabled: !!host && enabled,
    queryFn: ({ signal }) => {
      if (!host) throw new Error("当前平台不可安装移动插件");
      return client.resolve(pluginId, { host, releaseId }, signal);
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
};
export function useMobileCenterResolution(pluginId: string, releaseId?: string, enabled = true) {
  const config = useMobileCenterConfig();
  const query = useQuery(resolutionQuery(config.data, pluginId, releaseId, enabled));
  return { config, query };
}
export function useMobileCenterStatuses(releaseIds: readonly string[]) {
  const config = useMobileCenterConfig();
  const ids = [...new Set(releaseIds)].sort();
  return useQuery({
    queryKey: [...mobileCenterKeys.root, "statuses", config.data?.origin ?? null, ids],
    enabled: !!config.data,
    queryFn: ({ signal }) => client.statuses(ids, signal),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

/** 兼容且版本高于已装版本的选版结果即为可用更新。 */
const updateOf = (resolution: CenterResolution | undefined, installedVersion: string | null) => {
  const release = resolution?.release;
  return release &&
    installedVersion &&
    resolution.compatibility.status === "compatible" &&
    comparePluginVersions(release.version, installedVersion) > 0
    ? release
    : null;
};
export function useMobileCenterUpdate(
  pluginId: string,
  installedVersion: string | null,
  enabled = true
) {
  const result = useMobileCenterResolution(pluginId, undefined, enabled);
  return { ...result, update: updateOf(result.query.data, installedVersion) };
}
/** 已安装列表的批量更新检查；只返回有可用更新的插件，顺序同输入。 */
export function useMobileCenterUpdates(
  items: readonly { id: string; version: string | null; enabled: boolean }[]
) {
  const config = useMobileCenterConfig();
  const results = useQueries({
    queries: items.map(item => resolutionQuery(config.data, item.id, undefined, item.enabled)),
  });
  return items.flatMap((item, index) => {
    const release = item.enabled ? updateOf(results[index]?.data, item.version) : null;
    return release ? [{ pluginId: item.id, release }] : [];
  });
}
export function useMobileCenterInstall() {
  const queryClient = useQueryClient();
  const store = getMobileCenterInstallStore(queryClient);
  const tasks = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return {
    tasks,
    task: (pluginId: string) => tasks.get(pluginId) ?? null,
    install: store.install,
    cancel: store.cancel,
    retry: store.retry,
    refreshStatuses: store.refreshStatuses,
  };
}
