import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import type { CenterCatalogPage, PluginCommunity } from "../../../../contracts";
import { useApi } from "../../app/api";

export const communityKey = (pluginId: string) => ["plugin-community", pluginId] as const;

/** 评论与喜欢共用一份查询：喜欢数取首页，评论按 id 去重 */
export function useCommunity(pluginId: string) {
  const api = useApi();
  const query = useInfiniteQuery({
    queryKey: communityKey(pluginId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.getCommunity(pluginId, pageParam),
    getNextPageParam: page => page.nextCursor ?? undefined,
    refetchOnWindowFocus: true,
  });
  const first = query.data?.pages[0];
  const comments = [
    ...new Map(
      query.data?.pages.flatMap(page => page.comments).map(row => [row.id, row]) ?? []
    ).values(),
  ];
  return { query, first, comments };
}

type CommunityPages = InfiniteData<PluginCommunity, string | null>;
type CatalogPages = InfiniteData<CenterCatalogPage, string | null>;

/**
 * 喜欢先乐观更新：立刻改评论区与插件中心缓存里的计数，失败回滚。
 * 同一插件的请求按 scope 串行发出，连点时服务端最终状态与最后一次点击一致。
 */
export function useLike(pluginId: string) {
  const api = useApi();
  const client = useQueryClient();
  const key = communityKey(pluginId);
  const patchCatalog = (delta: number) =>
    // 前缀与 centerKeys.catalog 一致：覆盖所有平台、搜索与分类条件下的目录缓存
    client.setQueriesData<CatalogPages>({ queryKey: ["plugin-center-v2", "catalog"] }, data =>
      data
        ? {
            ...data,
            pages: data.pages.map(page => ({
              ...page,
              items: page.items.map(entry =>
                entry.pluginId === pluginId
                  ? { ...entry, likes: Math.max(0, entry.likes + delta) }
                  : entry
              ),
            })),
          }
        : data
    );
  return useMutation({
    scope: { id: `plugin-like:${pluginId}` },
    mutationFn: (liked: boolean) => api.setPluginLiked(pluginId, liked),
    onMutate: async (liked: boolean) => {
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<CommunityPages>(key);
      const first = previous?.pages[0];
      const delta = first && first.liked !== liked ? (liked ? 1 : -1) : 0;
      if (previous && first && delta)
        client.setQueryData<CommunityPages>(key, {
          ...previous,
          pages: [
            { ...first, liked, likes: Math.max(0, first.likes + delta) },
            ...previous.pages.slice(1),
          ],
        });
      if (delta) patchCatalog(delta);
      return { previous, delta };
    },
    onError: (_error, _liked, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
      if (context?.delta) patchCatalog(-context.delta);
    },
    // 只在最后一个请求落定后对齐服务端，避免中途刷新把乐观状态冲回去
    onSettled: () => {
      if (
        client.isMutating({ predicate: m => m.options.scope?.id === `plugin-like:${pluginId}` }) <=
        1
      )
        void client.invalidateQueries({ queryKey: key });
    },
  });
}
