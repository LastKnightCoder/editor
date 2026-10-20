import { invoke } from "@/electron";
import type {
  PluginContentRecord,
  PluginDataEntity,
  PluginDataPage,
  PluginDataQuery,
  PluginDataRecord,
} from "@/types/plugin-data";

/** 插件业务数据只读命令；调用方经 bindDatabaseCommands 固定到插件宿主的数据库 */
export const queryPluginData = (
  databaseName: string,
  entity: PluginDataEntity,
  query: PluginDataQuery
): Promise<PluginDataPage> => invoke("plugin-data:query", { databaseName, entity, query });

export const getPluginData = (
  databaseName: string,
  entity: PluginDataEntity,
  id: number
): Promise<PluginDataRecord | null> => invoke("plugin-data:get", { databaseName, entity, id });

export const readPluginContent = (
  databaseName: string,
  contentId: number,
  createdAt: number,
  format: "markdown" | "nodes"
): Promise<PluginContentRecord | null> =>
  invoke("plugin-data:content", { databaseName, contentId, createdAt, format });
