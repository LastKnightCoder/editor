// 文章域查询 hooks：订阅 query 缓存；编辑保存后由编辑页 invalidate 驱动刷新。

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as tauri from "../../services/tauri";
import { useInvalidateHomeStats } from "../home/queries";
import type { ArticleListItem } from "../../types";

const ARTICLES_STALE_MS = 10_000;

const ARTICLES_PAGE_SIZE = 40;

export function useArticlesQuery() {
  return useInfiniteQuery({
    queryKey: ["articles", "list"],
    queryFn: ({ pageParam }) => tauri.articleList({ offset: pageParam, limit: ARTICLES_PAGE_SIZE }),
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
