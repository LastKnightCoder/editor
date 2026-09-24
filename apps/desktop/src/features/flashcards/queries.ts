/**
 * 闪卡页数据源：一次拉全量（卡组 + 全部卡片含参考资料），渲染期纯函数派生（model.ts）。
 * 当前快照包含正文与参考资料；大卡库仍需改为摘要查询与详情按需加载。
 * 复习评分只回写单卡缓存（setQueryData），不整表重拉。
 *
 * 主进程没有闪卡变更广播：本页变更后自行失效；其它入口（文章 / 卡片里生成闪卡、AI 工具）
 * 新建的卡靠窗口聚焦与进入页面时重拉兜底。首页（待复习数）与统计页（评分分布）同源数据一并失效。
 */

import {
  createFlashcard,
  createFlashcardDeck,
  deleteFlashcard,
  deleteFlashcardDeck,
  getFlashcardReviewStats,
  listFlashcardDecks,
  listFlashcards,
  submitFlashcardReview,
  undoFlashcardReview,
  updateFlashcard,
  updateFlashcardDeck,
} from "@/commands/flashcard";
import type {
  CreateFlashcardDeckInput,
  CreateFlashcardInput,
  Flashcard,
  FlashcardDeck,
  FlashcardReviewRating,
  UpdateFlashcardDeckInput,
  UpdateFlashcardInput,
} from "@/types";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { DAY_MS, resumedStatus, startOfDay } from "./model";

const SNAPSHOT_KEY = ["flashcards", "snapshot"] as const;
const STATS_KEY = ["flashcards", "review-stats"] as const;

export interface FlashcardSnapshot {
  decks: FlashcardDeck[];
  cards: Flashcard[];
}

async function fetchSnapshot(): Promise<FlashcardSnapshot> {
  const [decks, cards] = await Promise.all([listFlashcardDecks(), listFlashcards({})]);
  return { decks, cards };
}

export function useFlashcardSnapshot() {
  const query = useQuery({
    queryKey: SNAPSHOT_KEY,
    queryFn: fetchSnapshot,
    staleTime: 30_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  return {
    snapshot: query.data,
    loading: query.isPending,
    error: query.error,
    retry: query.refetch,
  };
}

/** 近 7 天（含今天）评分分布 + 未来 7 天到期分桶（主进程 flashcard:review-stats） */
export function useReviewStats() {
  const query = useQuery({
    queryKey: STATS_KEY,
    queryFn: () => getFlashcardReviewStats({ since: startOfDay(Date.now()) - 6 * DAY_MS }),
    staleTime: 60_000,
  });
  return query.data ?? null;
}

function patchCard(queryClient: QueryClient, card: Flashcard) {
  queryClient.setQueryData<FlashcardSnapshot>(SNAPSHOT_KEY, prev =>
    prev ? { ...prev, cards: prev.cards.map(c => (c.id === card.id ? card : c)) } : prev
  );
}

/** 复习结束 / 离开页面时调用：刷新卡组计数、评分分布及首页 / 统计页 */
export function invalidateFlashcardViews(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ["flashcards"] });
  void queryClient.invalidateQueries({ queryKey: ["home"] });
  void queryClient.invalidateQueries({ queryKey: ["stats"] });
}

export function useFlashcardMutations() {
  const queryClient = useQueryClient();
  const refresh = () => invalidateFlashcardViews(queryClient);

  return {
    async createCard(input: CreateFlashcardInput) {
      const card = await createFlashcard(input);
      refresh();
      return card;
    },
    async updateCard(input: UpdateFlashcardInput) {
      const card = await updateFlashcard(input);
      if (card) patchCard(queryClient, card);
      refresh();
      return card;
    },
    async deleteCard(id: number) {
      await deleteFlashcard(id);
      refresh();
    },
    async setSuspended(card: Flashcard, suspended: boolean) {
      const status = suspended ? "suspended" : resumedStatus(card);
      const updated = await updateFlashcard({ id: card.id, status });
      if (!updated) throw new Error("闪卡已不存在");
      patchCard(queryClient, updated);
      refresh();
    },
    async moveToDeck(card: Flashcard, deckId: number) {
      const updated = await updateFlashcard({ id: card.id, deckId });
      if (!updated) throw new Error("闪卡已不存在");
      patchCard(queryClient, updated);
      refresh();
    },
    async createDeck(input: CreateFlashcardDeckInput) {
      const deck = await createFlashcardDeck(input);
      refresh();
      return deck;
    },
    async updateDeck(input: UpdateFlashcardDeckInput) {
      await updateFlashcardDeck(input);
      refresh();
    },
    async deleteDeck(id: number) {
      await deleteFlashcardDeck(id);
      refresh();
    },
    /** 主进程从落库前的真实排期生成撤销凭据。 */
    async submitReview(card: Flashcard, rating: FlashcardReviewRating) {
      const updated = await submitFlashcardReview({ cardId: card.id, deckId: card.deckId, rating });
      if (!updated) throw new Error("闪卡已不存在");
      const { undo, ...updatedCard } = updated;
      patchCard(queryClient, updatedCard);
      return undo;
    },
    async undoReview(payload: Parameters<typeof undoFlashcardReview>[0]) {
      const restored = await undoFlashcardReview(payload);
      if (!restored) throw new Error("闪卡已不存在");
      patchCard(queryClient, restored);
      return restored;
    },
    refresh,
  };
}

export type FlashcardMutations = ReturnType<typeof useFlashcardMutations>;
