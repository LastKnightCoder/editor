/**
 * 脉络数据：useEntityContext 读取一个实体与其他内容的关系。
 * 主进程在引用、实体或问题材料变化时广播 entity-context:changed，这里按库失效。
 */

import { useQuery, type QueryClient } from "@tanstack/react-query";
import { getEntityContext, getEntityRelated } from "@/commands/entity-context";
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

export function invalidateEntityContext(client: QueryClient, database: string) {
  return client.invalidateQueries({ queryKey: entityContextKeys.root(database) });
}

on("entity-context:changed", (_event, { databaseName }: { databaseName: string }) => {
  void invalidateEntityContext(queryClient, databaseName);
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
