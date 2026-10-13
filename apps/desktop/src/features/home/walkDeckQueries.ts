/**
 * 今日页「今日漫步」牌堆数据：每天一份固定牌堆（stale 偏好抽取），翻完即止。
 * queryKey 带本地日期，跨零点换 key 自然取新一天的牌；翻牌与重抽由 WalkDeckPanel
 * 乐观写回本缓存（setQueryData），落库走 daily-advance / daily-reroll。
 */

import { useQuery } from "@tanstack/react-query";
import { getRandomWalkDailyDeck } from "@/commands/random-walk";
import { dateStr } from "@/utils/statistic";
import type { WalkDailyDeck } from "@/types";

/** 牌堆缓存键（含本地日期 YYYY-MM-DD，供组件侧 setQueryData 定位同一份缓存） */
export function walkDeckKey(date: string) {
  return ["home", "walk-deck", date] as const;
}

export function useTodayWalkDeck(): {
  date: string;
  deck: WalkDailyDeck | null;
  loading: boolean;
} {
  // 每次 render 重算当天日期：跨零点后 key 变化，自然切到新一天的牌
  const date = dateStr(Date.now());
  const query = useQuery({
    queryKey: walkDeckKey(date),
    queryFn: () => getRandomWalkDailyDeck({ date }),
    refetchOnWindowFocus: true,
  });
  return { date, deck: query.data ?? null, loading: query.isPending };
}
