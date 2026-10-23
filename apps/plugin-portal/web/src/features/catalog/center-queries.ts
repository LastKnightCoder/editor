import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import {
  normalizeCenterQuery,
  normalizeCenterHost,
  type CenterCatalogQuery,
  type CenterResolveInput,
} from "@tau/plugins/center";
import { useApi } from "../../app/api";

export const centerKeys = {
  catalog: (input: CenterCatalogQuery) =>
    ["plugin-center-v2", "catalog", normalizeCenterQuery({ ...input, cursor: null })] as const,
  release: (id: string | null) => ["plugin-center-v2", "release", id] as const,
  resolve: (pluginId: string, input: CenterResolveInput) =>
    [
      "plugin-center-v2",
      "resolve",
      pluginId,
      normalizeCenterHost(input.host),
      input.releaseId ?? null,
    ] as const,
  releases: (pluginId: string, platform: CenterCatalogQuery["platform"]) =>
    ["plugin-center-v2", "releases", pluginId, platform] as const,
};

export function useCenterCatalog(input: Omit<CenterCatalogQuery, "cursor">) {
  const { center } = useApi();
  return useInfiniteQuery({
    queryKey: centerKeys.catalog(input),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      center.queryCatalog({ ...input, cursor: pageParam }, signal),
    getNextPageParam: page => page.nextCursor ?? undefined,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}
export function useCenterRelease(releaseId: string | null) {
  const { center } = useApi();
  return useQuery({
    queryKey: centerKeys.release(releaseId),
    enabled: releaseId !== null,
    queryFn: ({ signal }) => {
      if (!releaseId) throw new Error("缺少版本标识");
      return center.getRelease(releaseId, signal);
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}
export function useCenterResolution(pluginId: string, input: CenterResolveInput) {
  const { center } = useApi();
  return useQuery({
    queryKey: centerKeys.resolve(pluginId, input),
    queryFn: ({ signal }) => center.resolve(pluginId, input, signal),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}
export function useCenterVersions(pluginId: string, platform: CenterCatalogQuery["platform"]) {
  const { center } = useApi();
  return useInfiniteQuery({
    queryKey: centerKeys.releases(pluginId, platform),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      center.listReleases(pluginId, { platform, cursor: pageParam }, signal),
    getNextPageParam: page => page.nextCursor ?? undefined,
    staleTime: 60_000,
  });
}
export function useCenterDownload() {
  const { center } = useApi();
  return useMutation({ mutationFn: (releaseId: string) => center.download(releaseId) });
}
