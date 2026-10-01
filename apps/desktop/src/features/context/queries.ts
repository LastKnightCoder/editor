/**
 * 脉络数据：useEntityContext 读取一个实体与其他内容的关系。
 * 主进程在引用、实体或问题材料变化时广播 entity-context:changed，这里按库失效。
 */

import { useQuery, type QueryClient } from "@tanstack/react-query";
import { getEntityContext } from "@/commands/entity-context";
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
