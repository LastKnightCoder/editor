/**
 * 闪卡页数据源：一次拉全量（卡组 + 全部卡片含参考资料），渲染期纯函数派生（model.ts）。
 * 当前快照包含正文与参考资料；大卡库仍需改为摘要查询与详情按需加载。
 * 复习评分只回写单卡缓存（setQueryData），不整表重拉。
 *
 * 变更联动：主进程表层所有写命令广播 flashcards:changed（含文章 / 卡片 / AI 对话等生成入口），
 * 本模块常驻订阅并失效对应数据库的查询；侧栏徽标经 useNavDueCount 依赖本模块，
 * 故监听随壳层加载即接线）；窗口聚焦刷新仍保留作兜底（同步等绕过表层的写入路径）。
 * 首页（待复习数）与统计页（评分分布）由 invalidateFlashcardViews 一并失效。
 */

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
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import { useMemo } from "react";
import * as flashcardCommands from "@/commands/flashcard";
import { bindDatabaseCommands } from "@/services/command-context";
import { queryClient } from "@/queryClient";
import { DAY_MS, resumedStatus, startOfDay } from "./model";

const databaseId = (database: string) => database.replace(/\.db$/, "");
export const flashcardKeys = {
  root: (database: string) => ["flashcards", databaseId(database)] as const,
  snapshot: (database: string) => [...flashcardKeys.root(database), "snapshot"] as const,
  decks: (database: string) => [...flashcardKeys.root(database), "decks"] as const,
  stats: (database: string) => [...flashcardKeys.root(database), "review-stats"] as const,
  due: (database: string) => [...flashcardKeys.root(database), "nav-due-count"] as const,
};

function useFlashcardCommands() {
  const database = useSettingStore(state => state.setting.database.active);
  const commands = useMemo(
    () => bindDatabaseCommands(flashcardCommands, { databaseName: database }),
    [database]
  );
  return { database, commands };
}

const hasBridge = typeof window !== "undefined" && Boolean(window.electron);
if (hasBridge) {
  on("flashcards:changed", (_event, { databaseName }: { databaseName: string }) => {
    void queryClient.invalidateQueries({ queryKey: flashcardKeys.root(databaseName) });
  });
}

export interface FlashcardSnapshot {
  decks: FlashcardDeck[];
  cards: Flashcard[];
}

async function fetchSnapshot(commands: typeof flashcardCommands): Promise<FlashcardSnapshot> {
  const [decks, cards] = await Promise.all([
    commands.listFlashcardDecks(),
    commands.listFlashcards({}),
  ]);
  return { decks, cards };
}

export function useFlashcardSnapshot() {
  const { database, commands } = useFlashcardCommands();
  const connected = useDatabaseConnected();
  const query = useQuery({
    queryKey: flashcardKeys.snapshot(database),
    queryFn: () => fetchSnapshot(commands),
    enabled: connected,
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

/** 选择卡组只读取轻量卡组列表，不为选择入口加载全部题面。 */
export function useFlashcardDecks(enabled = true) {
  const { database, commands } = useFlashcardCommands();
  const connected = useDatabaseConnected();
  const query = useQuery({
    queryKey: flashcardKeys.decks(database),
    queryFn: () => commands.listFlashcardDecks(),
    enabled: enabled && connected,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  return {
    decks: query.data ?? [],
    loading: query.isPending,
    error: query.error,
    retry: query.refetch,
  };
}

/** 近 7 天（含今天）评分分布 + 未来 7 天到期分桶（主进程 flashcard:review-stats） */
export function useReviewStats() {
  const { database, commands } = useFlashcardCommands();
  const connected = useDatabaseConnected();
  const query = useQuery({
    queryKey: flashcardKeys.stats(database),
    queryFn: () => commands.getFlashcardReviewStats({ since: startOfDay(Date.now()) - 6 * DAY_MS }),
    enabled: connected,
    staleTime: 60_000,
  });
  return query.data ?? null;
}

/** 侧栏徽标的待复习总数（口径同首页 fetchReview：卡组 dueCount 求和，due_time 已到且未暂停） */
export function useNavDueCount() {
  const { database, commands } = useFlashcardCommands();
  const connected = useDatabaseConnected();
  const query = useQuery({
    queryKey: flashcardKeys.due(database),
    queryFn: async () =>
      (await commands.listFlashcardDecks()).reduce(
        (sum, deck) => sum + (deck.stats?.dueCount ?? 0),
        0
      ),
    enabled: connected,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  return query.data ?? 0;
}

function patchCard(queryClient: QueryClient, database: string, card: Flashcard) {
  queryClient.setQueryData<FlashcardSnapshot>(flashcardKeys.snapshot(database), prev =>
    prev ? { ...prev, cards: prev.cards.map(c => (c.id === card.id ? card : c)) } : prev
  );
}

/** 复习结束 / 离开页面时调用：刷新卡组计数、评分分布及今日页（含回顾段） */
export function invalidateFlashcardViews(queryClient: QueryClient, database?: string) {
  void queryClient.invalidateQueries({
    queryKey: database ? flashcardKeys.root(database) : ["flashcards"],
  });
  void queryClient.invalidateQueries({ queryKey: ["home"] });
}

export function useFlashcardMutations() {
  const queryClient = useQueryClient();
  const { database, commands } = useFlashcardCommands();
  const refresh = () => invalidateFlashcardViews(queryClient, database);
  const assertCurrentDatabase = () => {
    if (databaseId(useSettingStore.getState().setting.database.active) !== databaseId(database)) {
      throw new Error("数据库已切换，请重新打开闪卡操作");
    }
  };

  return {
    async createCard(input: CreateFlashcardInput) {
      assertCurrentDatabase();
      const card = await commands.createFlashcard(input);
      refresh();
      return card;
    },
    async updateCard(input: UpdateFlashcardInput) {
      assertCurrentDatabase();
      const card = await commands.updateFlashcard(input);
      if (!card) throw new Error("闪卡已不存在");
      patchCard(queryClient, database, card);
      refresh();
      return card;
    },
    async deleteCard(id: number) {
      assertCurrentDatabase();
      if (!(await commands.deleteFlashcard(id))) throw new Error("闪卡已不存在");
      refresh();
    },
    async setSuspended(card: Flashcard, suspended: boolean) {
      assertCurrentDatabase();
      const status = suspended ? "suspended" : resumedStatus(card);
      const updated = await commands.updateFlashcard({ id: card.id, status });
      if (!updated) throw new Error("闪卡已不存在");
      patchCard(queryClient, database, updated);
      refresh();
    },
    async moveToDeck(card: Flashcard, deckId: number) {
      assertCurrentDatabase();
      const updated = await commands.updateFlashcard({ id: card.id, deckId });
      if (!updated) throw new Error("闪卡已不存在");
      patchCard(queryClient, database, updated);
      refresh();
    },
    async createDeck(input: CreateFlashcardDeckInput) {
      assertCurrentDatabase();
      const deck = await commands.createFlashcardDeck(input);
      refresh();
      return deck;
    },
    async updateDeck(input: UpdateFlashcardDeckInput) {
      assertCurrentDatabase();
      const deck = await commands.updateFlashcardDeck(input);
      if (!deck) throw new Error("卡组已不存在");
      refresh();
      return deck;
    },
    async deleteDeck(id: number) {
      assertCurrentDatabase();
      if (!(await commands.deleteFlashcardDeck(id))) throw new Error("卡组已不存在");
      refresh();
    },
    /** 主进程从落库前的真实排期生成撤销凭据。 */
    async submitReview(card: Flashcard, rating: FlashcardReviewRating) {
      assertCurrentDatabase();
      const updated = await commands.submitFlashcardReview({
        cardId: card.id,
        deckId: card.deckId,
        rating,
      });
      if (!updated) throw new Error("闪卡已不存在");
      const { undo, ...updatedCard } = updated;
      patchCard(queryClient, database, updatedCard);
      return undo;
    },
    async undoReview(payload: Parameters<typeof flashcardCommands.undoFlashcardReview>[0]) {
      assertCurrentDatabase();
      const restored = await commands.undoFlashcardReview(payload);
      if (!restored) throw new Error("闪卡已不存在");
      patchCard(queryClient, database, restored);
      return restored;
    },
    refresh,
  };
}

export type FlashcardMutations = ReturnType<typeof useFlashcardMutations>;
