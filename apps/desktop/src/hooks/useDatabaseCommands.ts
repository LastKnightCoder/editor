import { useMemo, useSyncExternalStore } from "react";
import {
  bindDatabaseCommands,
  getDatabaseConnection,
  subscribeDatabaseConnections,
} from "@/services/command-context";

/** 页面跟随连接代次重建命令；已经交给异步操作的旧命令仍固定原连接。 */
export function useDatabaseCommands<T extends object>(commands: T, databaseName: string) {
  const connection = useSyncExternalStore(subscribeDatabaseConnections, () =>
    getDatabaseConnection(databaseName)
  );
  const connectionId = connection?.connectionId;
  const bound = useMemo(
    () => bindDatabaseCommands(commands, { databaseName, connectionId }),
    [commands, databaseName, connectionId]
  );
  return { commands: bound, connectionId };
}
