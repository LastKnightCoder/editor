// 首页汇总统计：一次 invoke 拿各内容域计数；各内容域 mutation 后经 invalidateHomeStats 联动刷新。

import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as tauri from "../../services/tauri";

const HOME_STATS_STALE_MS = 10_000;

export const homeStatsKey = ["home", "stats"] as const;

export function useHomeStatsQuery() {
  return useQuery({
    queryKey: homeStatsKey,
    queryFn: () => tauri.getHomeStats(),
    staleTime: HOME_STATS_STALE_MS,
  });
}

export function useInvalidateHomeStats() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: homeStatsKey });
  };
}
