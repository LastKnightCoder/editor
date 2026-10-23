import { useSyncExternalStore } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  normalizeCenterQuery,
  type CenterCatalogQuery,
  type CenterPlatform,
} from "@tau/plugins/center";
import {
  createMobilePluginCenterClient,
  readMobileCenterConfig,
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
export function useMobileCenterResolution(pluginId: string, releaseId?: string, enabled = true) {
  const config = useMobileCenterConfig();
  const host = config.data?.host;
  const query = useQuery({
    queryKey: [
      ...mobileCenterKeys.root,
      "resolve",
      config.data?.origin ?? null,
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

export function useMobileCenterUpdate(
  pluginId: string,
  installedVersion: string | null,
  enabled = true
) {
  const result = useMobileCenterResolution(pluginId, undefined, enabled);
  const release = result.query.data?.release;
  const update =
    release &&
    installedVersion &&
    result.query.data?.compatibility.status === "compatible" &&
    comparePluginVersions(release.version, installedVersion) > 0
      ? release
      : null;
  return { ...result, update };
}
export function useMobileCenterInstall() {
  const queryClient = useQueryClient();
  const store = getMobileCenterInstallStore(queryClient);
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return {
    phase: snapshot.phase,
    task: snapshot,
    mutation: {
      isPending: snapshot.status === "pending",
      isSuccess: snapshot.status === "success",
      isError: snapshot.status === "error",
      error: snapshot.error,
      reset: store.reset,
    },
    install: store.install,
    cancel: store.cancel,
    retry: store.retry,
    refreshStatuses: store.refreshStatuses,
  };
}
