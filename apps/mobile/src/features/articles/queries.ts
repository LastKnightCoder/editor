// 文章域查询 hooks：订阅 query 缓存；编辑保存后由编辑页 invalidate 驱动刷新。

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as tauri from "../../services/tauri";
import { useInvalidateHomeStats } from "../home/queries";
import type { ArticleListItem } from "../../types";
import { logPerfSize } from "../../utils/perf";

const ARTICLES_STALE_MS = 10_000;

const ARTICLES_PAGE_SIZE = 40;

export function useArticlesQuery() {
  return useInfiniteQuery({
    queryKey: ["articles", "list"],
    queryFn: async ({ pageParam }) => {
      const res = await tauri.articleList({ offset: pageParam, limit: ARTICLES_PAGE_SIZE });
      // 诊断卡顿：确认列表瘦身后的真实 IPC 负载（应只剩元数据 + 摘要，几十 KB 量级）
      logPerfSize(
        "articles",
        `list page@${pageParam} items=${res.items.length}/${res.total}`,
        JSON.stringify(res).length
      );
      return res;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((count, page) => count + page.items.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    staleTime: ARTICLES_STALE_MS,
  });
}

export function useArticleQuery(id: number, enabled = true) {
  return useQuery({
    queryKey: ["articles", "detail", id],
    queryFn: () => tauri.articleGet(id),
    enabled: enabled && id > 0,
    staleTime: ARTICLES_STALE_MS,
  });
}

export function useInvalidateArticles() {
  const queryClient = useQueryClient();
  const invalidateHomeStats = useInvalidateHomeStats();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["articles"] });
    invalidateHomeStats();
  };
}

export function useArticleToggleTop(onDone?: (article: ArticleListItem) => void) {
  const invalidate = useInvalidateArticles();
  return useMutation({
    mutationFn: (article: ArticleListItem) =>
      tauri.articleUpdate({ id: article.id, isTop: !article.isTop }),
    onSuccess: article => {
      invalidate();
      onDone?.(article);
    },
  });
}

export function useArticleDelete(onDone?: () => void) {
  const invalidate = useInvalidateArticles();
  return useMutation({
    mutationFn: (id: number) => tauri.articleDelete(id),
    onSuccess: () => {
      invalidate();
      onDone?.();
    },
  });
}
