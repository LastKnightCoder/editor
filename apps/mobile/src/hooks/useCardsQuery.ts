import { useMemo, useState } from "react";
import { useMemoizedFn } from "ahooks";
import type { CardsOverviewResponse, CardsQueryState } from "../types";
import * as tauri from "../services/tauri";

const DEFAULT_PAGE_SIZE = 20;

export function useCardsQuery() {
  const [cards, setCards] = useState<CardsOverviewResponse | null>(null);
  const [isLoadingCards, setIsLoadingCards] = useState(false);
  const [queryState, setQueryState] = useState<CardsQueryState>({
    query: "",
    category: "",
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  });

  const refreshCards = useMemoizedFn(
    async (overrides?: Partial<CardsQueryState>) => {
      const nextState = { ...queryState, ...overrides };
      setIsLoadingCards(true);
      try {
        const result = await tauri.getCardsOverview({
          page: nextState.page,
          pageSize: nextState.pageSize,
          query: nextState.query,
          category: nextState.category,
        });

        // 判断是否为加载更多（同一搜索条件下的下一页）
        const isLoadMore =
          nextState.page > 1 &&
          nextState.query === queryState.query &&
          nextState.category === queryState.category;

        if (isLoadMore && cards) {
          // 追加数据
          setCards({
            ...result,
            items: [...cards.items, ...result.items],
          });
        } else {
          // 替换数据（首页或搜索条件变化）
          setCards(result);
        }

        setQueryState({
          query: nextState.query,
          category: nextState.category,
          page: result.page,
          pageSize: result.pageSize,
        });
        return result;
      } finally {
        setIsLoadingCards(false);
      }
    },
  );

  const totalPages = useMemo(() => {
    if (!cards) return 1;
    return Math.max(1, Math.ceil(cards.total / cards.pageSize));
  }, [cards]);

  return {
    cards,
    totalPages,
    queryState,
    isLoadingCards,
    setQueryState,
    refreshCards,
  };
}
