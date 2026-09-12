// todo 域查询 hooks：组件直接订阅 query 缓存（单一状态源），
// mutation 后由 useTodoStore 的 invalidateQueries(["todo"]) 驱动刷新。

import { useQuery } from "@tanstack/react-query";
import type { TodoGroup, TodoGroupStats, TodoSystemGroupType } from "../../types";
import * as tauri from "../../services/tauri";

const TODO_STALE_MS = 30_000;

export function useTodoGroups() {
  return useQuery({
    queryKey: ["todo", "groups"],
    queryFn: () => tauri.todoListGroups(),
    staleTime: TODO_STALE_MS,
  });
}

export function useTodoSystemGroups(enabled = true) {
  return useQuery({
    queryKey: ["todo", "systemGroups"],
    queryFn: () => tauri.todoGetSystemGroups(),
    staleTime: TODO_STALE_MS,
    enabled,
  });
}

export function resolveStatsMap(
  groupStats: TodoGroupStats[],
  systemStats: TodoGroupStats[]
): Record<number, TodoGroupStats> {
  const next: Record<number, TodoGroupStats> = {};
  groupStats.forEach(stats => {
    next[stats.groupId] = stats;
  });
  systemStats.forEach(stats => {
    next[stats.groupId] = stats;
  });
  return next;
}

export function useTodoGroupStats(enabled = true) {
  return useQuery({
    queryKey: ["todo", "stats"],
    queryFn: async () => {
      const [groupStats, systemStats] = await Promise.all([
        tauri.todoGetGroupStats(),
        tauri.todoGetSystemGroupStats(),
      ]);
      return resolveStatsMap(groupStats, systemStats);
    },
    staleTime: TODO_STALE_MS,
    enabled,
  });
}

export type TodoItemsKeyInput = {
  /** 普通分组的 items key */
  groupId?: number;
  /** 系统分组的 items key（"all"/"normal"/...） */
  systemType?: Exclude<TodoSystemGroupType, null>;
};

export function useTodoItems(input: TodoItemsKeyInput) {
  const isSystem = input.systemType !== undefined;
  return useQuery({
    queryKey: isSystem
      ? ["todo", "items", "system", input.systemType]
      : ["todo", "items", "group", input.groupId ?? -1],
    queryFn: () =>
      isSystem
        ? tauri.todoListItemsByType({ type: input.systemType! })
        : tauri.todoListItems({ groupId: input.groupId! }),
    enabled: isSystem ? true : typeof input.groupId === "number" && input.groupId > 0,
    staleTime: TODO_STALE_MS,
  });
}

/** 按 cacheKey（getTodoItemsCacheKey 产物）订阅，TodoPage 激活组用 */
export function useTodoItemsByCacheKey(cacheKey: string | null, systemGroups: TodoGroup[]) {
  const systemType = cacheKey?.startsWith("_system_")
    ? (cacheKey.slice("_system_".length) as Exclude<TodoSystemGroupType, null>)
    : undefined;
  const groupId = !systemType && cacheKey ? Number(cacheKey) : undefined;
  void systemGroups;
  return useTodoItems({ groupId, systemType });
}
