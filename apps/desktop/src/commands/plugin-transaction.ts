import { invoke } from "@/electron";
import type { PluginTransactionCommitOp } from "@/types/plugin-transaction";

/** 插件原子提交命令；调用方经 bindDatabaseCommands 固定到插件宿主的数据库 */
export const reservePluginEntityId = (databaseName: string, pluginId: string): Promise<number> =>
  invoke("plugin-entities:reserve-id", { databaseName, pluginId });

export const commitPluginTransaction = (
  databaseName: string,
  pluginId: string,
  ops: PluginTransactionCommitOp[]
): Promise<void> => invoke("plugin-transaction:commit", { databaseName, pluginId, ops });
