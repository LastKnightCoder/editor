/**
 * 脉络数据：useEntityContext 读取一个实体与其他内容的关系。
 * 主进程在引用、实体、问题材料或正文连接变化时广播 entity-context:changed，这里按库失效；
 * content-links:changed 只失效连接列表（表格列等直接消费方）。
 */

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { getEntityContext, getEntityRelated } from "@/commands/entity-context";
import {
  addContentLink,
  listContentLinksByContentIds,
  removeContentLink,
} from "@/commands/content-link";
import { on } from "@/electron";
import type { EntityRef } from "@/entity/ref";
import useDatabaseConnected from "@/hooks/useDatabaseConnected";
import { queryClient } from "@/queryClient";
import useSettingStore from "@/stores/useSettingStore";

const databaseId = (database: string) => database.replace(/\.db$/, "");

export const entityContextKeys = {
  root: (database: string) => ["entity-context", databaseId(database)] as const,
  entity: (database: string, ref: EntityRef) =>
    [...entityContextKeys.root(database), ref.kind, ref.id] as const,
  related: (database: string, ref: EntityRef) =>
    [...entityContextKeys.entity(database, ref), "related"] as const,
};

export const contentLinksKeys = {
  root: (database: string) => ["content-links", databaseId(database)] as const,
};

export function invalidateEntityContext(client: QueryClient, database: string) {
  return client.invalidateQueries({ queryKey: entityContextKeys.root(database) });
}

on("entity-context:changed", (_event, { databaseName }: { databaseName: string }) => {
  void invalidateEntityContext(queryClient, databaseName);
  // 删实体释放边只广播 entity-context:changed（CONTEXT_WRITE_EVENTS），连接列表连带失效
  void queryClient.invalidateQueries({ queryKey: contentLinksKeys.root(databaseName) });
});

on("content-links:changed", (_event, { databaseName }: { databaseName: string }) => {
  void queryClient.invalidateQueries({ queryKey: contentLinksKeys.root(databaseName) });
});

export function useEntityContext(ref: EntityRef | null) {
  const database = useSettingStore(state => state.setting.database.active);
  const connected = useDatabaseConnected();
  return useQuery({
    queryKey: ref
      ? entityContextKeys.entity(database, ref)
      : [...entityContextKeys.root(database), "none"],
    queryFn: () => getEntityContext(ref!),
    enabled: connected && ref !== null && ref.id > 0,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

/** 「相关」只在浮层打开时取：要查一次向量近邻，不随元信息行常驻 */
export function useEntityRelated(ref: EntityRef | null, enabled: boolean) {
  const database = useSettingStore(state => state.setting.database.active);
  const connected = useDatabaseConnected();
  return useQuery({
    queryKey: ref
      ? entityContextKeys.related(database, ref)
      : [...entityContextKeys.root(database), "none", "related"],
    queryFn: () => getEntityRelated(ref!),
    enabled: enabled && connected && ref !== null && ref.id > 0,
    staleTime: 60_000,
  });
}

/** 一组正文各自的连接目标（已解析为代表身份与标题），表格列等列表消费。
 * 当前唯一调用方（卡片表格列）总是传全量正文，key 固定库级、失效全靠
 * content-links:changed 广播与 mutation 级联——避免全量 ids 进 key 在卡片增删时
 * 漂移成反复全量重拉与大载荷多份缓存；新卡未入缓存时按"无连接"展示，
 * 添加连接后经失效补齐。 */
export function useContentLinksByContentIds(contentIds: number[]) {
  const database = useSettingStore(state => state.setting.database.active);
  const connected = useDatabaseConnected();
  const ids = [...new Set(contentIds.filter(id => Number.isSafeInteger(id) && id > 0))].sort(
    (a, b) => a - b
  );
  return useQuery({
    queryKey: contentLinksKeys.root(database),
    queryFn: () => listContentLinksByContentIds(ids),
    enabled: connected && ids.length > 0,
    staleTime: 30_000,
  });
}

/** 建立连接（无向边单行写入，原子双边）；连带失效脉络与连接列表 */
export function useAddContentLink() {
  const database = useSettingStore(state => state.setting.database.active);
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ from, to }: { from: EntityRef; to: EntityRef }) => addContentLink(from, to),
    onSuccess: () => {
      void invalidateEntityContext(client, database);
      void client.invalidateQueries({ queryKey: contentLinksKeys.root(database) });
    },
  });
}

/** 解除连接；连带失效脉络与连接列表 */
export function useRemoveContentLink() {
  const database = useSettingStore(state => state.setting.database.active);
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ from, to }: { from: EntityRef; to: EntityRef }) => removeContentLink(from, to),
    onSuccess: () => {
      void invalidateEntityContext(client, database);
      void client.invalidateQueries({ queryKey: contentLinksKeys.root(database) });
    },
  });
}
