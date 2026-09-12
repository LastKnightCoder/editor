// 卡片列表数据层：基于 TanStack Query 的无限列表。
// - query key 按搜索条件参数化，条件变化自动重新拉取首页
// - "加载更多" = fetchNextPage，缓存恢复由 query 语义承载（gcTime 内返回秒显）
// - 对外接口与旧 useState 实现保持一致，消费方零改动

import { useEffect, useMemo, useState } from "react";
import { useMemoizedFn } from "ahooks";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { Descendant } from "slate";
import type { CardsOverviewResponse, CardsQueryState } from "../types";
import * as tauri from "../services/tauri";

const DEFAULT_PAGE_SIZE = 20;

type CardsPage = CardsOverviewResponse;

function mergePages(pages: CardsPage[]): CardsOverviewResponse {
  if (pages.length === 0) {
    return {
      total: 0,
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      query: "",
      category: "",
      searchMode: "none",
      items: [],
    };
  }
  const last = pages[pages.length - 1];
  return {
    ...last,
    items: pages.flatMap(page => page.items),
  };
}

export function useCardsQuery() {
  const queryClient = useQueryClient();
  const [queryState, setQueryState] = useState<CardsQueryState>({
    query: "",
    category: "",
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  const queryKey = useMemo(
    () => ["cards", { query: queryState.query, category: queryState.category }] as const,
    [queryState.query, queryState.category]
  );

  const infiniteQuery = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) =>
      tauri.getCardsOverview({
        page: pageParam,
        pageSize: queryState.pageSize,
        query: queryState.query,
        category: queryState.category,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const totalPages = Math.max(1, Math.ceil(lastPage.total / lastPage.pageSize));
      const loadedPages = allPages.length;
      return loadedPages < totalPages ? loadedPages + 1 : undefined;
    },
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  // query 侧的页码变化（缓存恢复/失效重取）同步回 queryState
  const data = infiniteQuery.data;
  useEffect(() => {
    if (!data) return;
    const last = data.pages[data.pages.length - 1];
    setQueryState(prev =>
      prev.page === data.pages.length && prev.pageSize === last.pageSize
        ? prev
        : { ...prev, page: data.pages.length, pageSize: last.pageSize }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const cards = useMemo(() => (data ? mergePages(data.pages) : null), [data]);

  const totalPages = useMemo(() => {
    if (!cards) return 1;
    return Math.max(1, Math.ceil(cards.total / cards.pageSize));
  }, [cards]);

  /** 兼容旧接口：刷新列表（首页或按 overrides），加载更多传 { page: prev+1 } */
  const refreshCards = useMemoizedFn(
    async (overrides?: Partial<CardsQueryState>): Promise<CardsOverviewResponse | null> => {
      const nextState = { ...queryState, ...overrides };
      const conditionChanged =
        nextState.query !== queryState.query || nextState.category !== queryState.category;

      if (conditionChanged) {
        setQueryState(prev => ({
          ...prev,
          query: nextState.query ?? prev.query,
          category: nextState.category ?? prev.category,
          page: 1,
        }));
        return cards;
      }

      if (nextState.page === 1) {
        await queryClient.invalidateQueries({ queryKey });
        return cards;
      }

      // 加载更多：逐页补齐到目标页
      const target = Math.max(1, nextState.page ?? 1);
      const loaded = data?.pages.length ?? 0;
      for (let page = loaded + 1; page <= target; page += 1) {
        const hasNext = await infiniteQuery.fetchNextPage();
        if (!hasNext) break;
      }
      return cards;
    }
  );

  const patchCardsByContent = useMemoizedFn(
    (payload: { contentId: number; content: Descendant[]; updateTime: number }) => {
      queryClient.setQueriesData<{ pages: CardsPage[]; pageParams: number[] }>(
        { queryKey: ["cards"] },
        prev => {
          if (!prev) return prev;
          let changed = false;
          const pages = prev.pages.map(page => {
            let pageChanged = false;
            const items = page.items.map(item => {
              if (item.contentId !== payload.contentId) {
                return item;
              }
              pageChanged = true;
              return {
                ...item,
                content: payload.content,
                updateTime: Math.max(item.updateTime, payload.updateTime),
              };
            });
            if (!pageChanged) return page;
            changed = true;
            return { ...page, items };
          });
          if (!changed) return prev;
          return { ...prev, pages };
        }
      );
    }
  );

  // 返回值 memo 化：字段不变时引用稳定（cards/totalPages 已 memo，回调经 useMemoizedFn）
  return useMemo(
    () => ({
      cards,
      totalPages,
      queryState,
      isLoadingCards: infiniteQuery.isLoading,
      setQueryState,
      refreshCards,
      patchCardsByContent,
    }),
    [
      cards,
      totalPages,
      queryState,
      infiniteQuery.isLoading,
      setQueryState,
      refreshCards,
      patchCardsByContent,
    ]
  );
}
