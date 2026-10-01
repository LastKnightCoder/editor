/**
 * 数据库模块数据源。形态与 features/projects/queries.ts 同构：
 * 列表全量轻表（数量级小，无分页窗口），变更后整域 ["databases"] 失效重拉。
 */

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listDatabaseItems,
  getDatabaseItem,
  createDatabaseItem,
  updateDatabaseItem,
  deleteDatabaseItem,
  recordDatabaseItemOpen,
} from "@/commands/database-item";
import type { DatabaseItem, DatabaseItemSummary } from "@/types";
import type { CockpitMutations } from "@/features/shared/cockpit/types";

/* 空值兜底用模块级常量：?? [] 每次渲染新建引用会击穿下游 useMemo deps 链 */
const EMPTY_ITEMS: DatabaseItemSummary[] = [];

export function useDatabasesSnapshot(): {
  items: DatabaseItemSummary[];
  loading: boolean;
} {
  const query = useQuery({
    queryKey: ["databases", "list"],
    queryFn: listDatabaseItems,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  return { items: query.data ?? EMPTY_ITEMS, loading: query.isPending };
}

/** 详情页记录打开：数据库存在时，每次进入记一次 */
export function useRecordDatabaseOpen(id: number, ready: boolean) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!ready) return;
    recordDatabaseItemOpen(id)
      .then(() => queryClient.invalidateQueries({ queryKey: ["databases", "list"] }))
      .catch(error => console.error("[databases] 记录打开失败", error));
  }, [id, ready, queryClient]);
}

export function useDatabaseDetail(id: number): {
  item: DatabaseItem | null;
  loading: boolean;
} {
  const query = useQuery({
    queryKey: ["databases", "detail", id],
    queryFn: () => getDatabaseItem(id),
    enabled: Number.isFinite(id),
    staleTime: 60_000,
  });
  return { item: query.data ?? null, loading: query.isPending };
}

export function useDatabaseMutations(): CockpitMutations {
  const queryClient = useQueryClient();
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["databases"] });

  const patch = async (id: number, changes: Partial<DatabaseItem>) => {
    const item = await findItem(queryClient, id);
    if (!item) return;
    await updateDatabaseItem({ ...item, ...changes });
    invalidate();
  };

  return {
    async create({ title, desc }) {
      const created = await createDatabaseItem({ title, desc });
      invalidate();
      return created;
    },
    async updateInfo(id, title, desc) {
      await patch(id, { title, desc });
    },
    async togglePin(id, pinned) {
      await patch(id, { pinned });
    },
    async setArchived(id, archived) {
      // 归档即退出活跃空间，同时清置顶（置顶段不再捞起）
      await patch(id, archived ? { archived, pinned: false } : { archived });
    },
    async remove(id) {
      await deleteDatabaseItem(id);
      invalidate();
    },
  };
}

/** 优先取列表缓存中的实例（免一次 IPC）；未命中再单独拉取 */
async function findItem(
  queryClient: ReturnType<typeof useQueryClient>,
  id: number
): Promise<DatabaseItem | null> {
  const cached = queryClient.getQueryData<DatabaseItemSummary[]>(["databases", "list"]);
  const hit = cached?.find(item => item.id === id);
  if (hit) return hit;
  return getDatabaseItem(id);
}
