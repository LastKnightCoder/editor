import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

export function useLike(pluginId: string) {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (liked: boolean) => api.setPluginLiked(pluginId, liked),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: communityKey(pluginId) }),
        client.invalidateQueries({ queryKey: ["catalog"] }),
      ]),
  });
}
