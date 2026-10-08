/**
 * 协作页数据：只有「共享本地内容」的候选检索走 react-query；会话 / 成员 / 申请是主进程
 * 推送的实时状态，走 stores/useCollaborationStore，不进查询缓存。
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { searchHybridContent } from "@/commands";
import useSettingStore from "@/stores/useSettingStore";
import { resolveEmbeddingModelInfoFromSetting } from "@/utils/embedding-model-info";
import type { ContentIndexType, SearchResult } from "@/types";

export const SHAREABLE_TYPES: ContentIndexType[] = [
  "article",
  "card",
  "project-item",
  "diary-moment",
];

const LIMIT = 30;

export function useShareCandidates(query: string, type: ContentIndexType | "all") {
  const keyword = query.trim();
  return useQuery({
    queryKey: ["collaboration", "share-candidates", keyword, type],
    queryFn: (): Promise<SearchResult[]> =>
      searchHybridContent({
        query: keyword,
        types: type === "all" ? SHAREABLE_TYPES : [type],
        limit: LIMIT,
        modelInfo: resolveEmbeddingModelInfoFromSetting(useSettingStore.getState().setting),
      }),
    enabled: keyword.length > 0,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}
