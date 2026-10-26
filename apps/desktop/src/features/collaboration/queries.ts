/**
 * 协作页数据：只有「共享本地内容」的候选检索（正文 + 白板）走 react-query；会话 / 成员 / 申请是主进程
 * 推送的实时状态，走 stores/useCollaborationStore，不进查询缓存。
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { searchHybridContent } from "@/commands";
import { searchWhiteboardShareCandidates } from "@/commands/whiteboard-document";
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

export type ShareType = ContentIndexType | "whiteboard" | "all";

export function useShareCandidates(query: string, type: ShareType) {
  const keyword = query.trim();
  return useQuery({
    queryKey: ["collaboration", "share-candidates", keyword, type],
    queryFn: (): Promise<SearchResult[]> =>
      searchHybridContent({
        query: keyword,
        types: type === "all" || type === "whiteboard" ? SHAREABLE_TYPES : [type],
        limit: LIMIT,
        modelInfo: resolveEmbeddingModelInfoFromSetting(useSettingStore.getState().setting),
      }),
    enabled: keyword.length > 0 && type !== "whiteboard",
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
}

/** 尚未共享的整块白板：只选「白板」时空关键词列最近更新的，「全部」时随关键词检索。 */
export function useWhiteboardShareCandidates(query: string, type: ShareType) {
  const keyword = query.trim();
  const databaseName = useSettingStore(state => state.setting.database.active);
  return useQuery({
    queryKey: ["collaboration", "whiteboard-candidates", databaseName, keyword],
    queryFn: () => searchWhiteboardShareCandidates(databaseName, keyword),
    enabled: type === "whiteboard" || (type === "all" && keyword.length > 0),
    // 刚共享的白板必须立即离开候选，不复用缓存
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}
