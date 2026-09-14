// 闪卡域查询 hooks：组件直接订阅 query 缓存，写操作后 invalidateFlashcardQueries
// 驱动刷新（对齐 pomodoro/queries.ts 范式）。

import { useQuery } from "@tanstack/react-query";
import { getQueryClient } from "../../router";
import type { Flashcard, FlashcardDeck, FlashcardReviewDayStats } from "./types";
import * as tauri from "../../services/tauri";

/** 本地时区的当天 00:00 时间戳（统计切日与用户体感一致）；offsetDays 逐日构造，DST 日不漂移 */
function localDayStart(offsetDays = 0): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - offsetDays).getTime();
}

/** 最近 N 天（含今天）的 dayStarts，旧→新 */
export function recentDayStarts(days: number): number[] {
  return Array.from({ length: days }, (_, i) => localDayStart(days - 1 - i));
}

const FLASHCARD_STALE_MS = 30_000;

export function useFlashcardDecks() {
  return useQuery({
    queryKey: ["flashcard", "decks"],
    queryFn: () => tauri.flashcardListDecks(),
    staleTime: FLASHCARD_STALE_MS,
  });
}

export function useFlashcardCards(params: { deckId: number }) {
  return useQuery({
    queryKey: ["flashcard", "cards", params.deckId],
    queryFn: () =>
      tauri.flashcardListCards(params).catch(error => {
        // 调试用：list 失败在 UI 上只显示“加载失败”，错误本体必须可见
        // eslint-disable-next-line no-restricted-syntax
        console.error(
          `[flashcard] list_cards failed deckId=${params.deckId} error=${JSON.stringify(error)} msg=${error instanceof Error ? error.message : String(error)}`
        );
        throw error;
      }),
    staleTime: FLASHCARD_STALE_MS,
  });
}

/** 最近 N 天复习统计（趋势 + 分布），含今天 */
export function useFlashcardReviewStats(days = 7) {
  return useQuery({
    queryKey: ["flashcard", "stats", "reviews", days],
    queryFn: () => tauri.flashcardReviewStats(recentDayStarts(days)),
    staleTime: FLASHCARD_STALE_MS,
  });
}

export function todayReviewedCount(stats: FlashcardReviewDayStats[] | undefined): number {
  return stats && stats.length > 0 ? stats[stats.length - 1].count : 0;
}

/** 复习队列走一次性拉取（复习页持有快照，不做响应式订阅） */
export async function fetchReviewQueue(deckId?: number, limit = 20): Promise<Flashcard[]> {
  return tauri.flashcardGetReviewQueue({ deckId: deckId ?? null, limit });
}

export function invalidateFlashcardQueries() {
  getQueryClient().invalidateQueries({ queryKey: ["flashcard"] });
}

/** 轻量失效：只刷卡组统计（复习中每评一张调用，避免底层页面全量重拉卡片列表/364 天统计） */
export function invalidateFlashcardDeckStats() {
  const queryClient = getQueryClient();
  queryClient.invalidateQueries({ queryKey: ["flashcard", "decks"] });
}

/** 主页概览：待复习总数 = 各卡组 dueCards 之和 */
export function totalDueOf(decks: FlashcardDeck[]): number {
  return decks.reduce((sum, deck) => sum + (deck.stats?.dueCards ?? 0), 0);
}
