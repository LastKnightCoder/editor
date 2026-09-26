/**
 * 闪卡页数据源：一次拉全量（卡组 + 全部卡片含参考资料），渲染期纯函数派生（model.ts）。
 * 当前快照包含正文与参考资料；大卡库仍需改为摘要查询与详情按需加载。
 * 复习评分只回写单卡缓存（setQueryData），不整表重拉。
 *
 * 变更联动：主进程表层所有写命令广播 flashcards:changed（含文章 / 卡片 / AI 对话等生成入口），
 * 本模块常驻订阅并失效 ["flashcards"] 查询（按库过滤；侧栏徽标经 useNavDueCount 依赖本模块，
 * 故监听随壳层加载即接线）；窗口聚焦刷新仍保留作兜底（同步等绕过表层的写入路径）。
 * 首页（待复习数）与统计页（评分分布）由 invalidateFlashcardViews 一并失效。
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
import { on } from "@/electron";
import useSettingStore from "@/stores/useSettingStore";
import { queryClient } from "@/queryClient";
import { DAY_MS, resumedStatus, startOfDay } from "./model";

const SNAPSHOT_KEY = ["flashcards", "snapshot"] as const;
const STATS_KEY = ["flashcards", "review-stats"] as const;

const hasBridge = typeof window !== "undefined" && Boolean(window.electron);
if (hasBridge) {
  on("flashcards:changed", (_event, { databaseName }: { databaseName: string }) => {
    const active = useSettingStore.getState().setting.database.active;
    if (databaseName.replace(".db", "") !== active.replace(".db", "")) return;
    void queryClient.invalidateQueries({ queryKey: ["flashcards"] });
  });
}

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

/** 侧栏徽标的待复习总数（口径同首页 fetchReview：卡组 dueCount 求和，due_time 已到且未暂停） */
export function useNavDueCount() {
  const query = useQuery({
    queryKey: ["flashcards", "nav-due-count"],
    queryFn: async () =>
      (await listFlashcardDecks()).reduce((sum, deck) => sum + (deck.stats?.dueCount ?? 0), 0),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  return query.data ?? 0;
}

function patchCard(queryClient: QueryClient, card: Flashcard) {
  queryClient.setQueryData<FlashcardSnapshot>(SNAPSHOT_KEY, prev =>
    prev ? { ...prev, cards: prev.cards.map(c => (c.id === card.id ? card : c)) } : prev
  );
}

/** 复习结束 / 离开页面时调用：刷新卡组计数、评分分布及今日页（含回顾段） */
export function invalidateFlashcardViews(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ["flashcards"] });
  void queryClient.invalidateQueries({ queryKey: ["home"] });
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
