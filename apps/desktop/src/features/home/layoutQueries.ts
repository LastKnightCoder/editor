/**
 * 首页布局数据：随笔记库保存（主库 home_panel_layout）。调整时先写缓存再落库，失败回滚。
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@tau/ui";
import { getHomeLayout, saveHomeLayout } from "@/commands/home-layout";
import type { HomeLayoutEntry } from "@/types/home-layout";

const HOME_LAYOUT_KEY = ["home", "layout"] as const;

export function useHomeLayout(): {
  layout: HomeLayoutEntry[] | null;
  save(next: HomeLayoutEntry[]): void;
} {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: HOME_LAYOUT_KEY,
    queryFn: getHomeLayout,
    refetchOnWindowFocus: true,
  });
  const save = (next: HomeLayoutEntry[]) => {
    const previous = queryClient.getQueryData<HomeLayoutEntry[]>(HOME_LAYOUT_KEY);
    queryClient.setQueryData(HOME_LAYOUT_KEY, next);
    saveHomeLayout(next).then(
      saved => queryClient.setQueryData(HOME_LAYOUT_KEY, saved),
      () => {
        queryClient.setQueryData(HOME_LAYOUT_KEY, previous);
        toast.error("首页布局保存失败");
      }
    );
  };
  return { layout: query.data ?? null, save };
}
