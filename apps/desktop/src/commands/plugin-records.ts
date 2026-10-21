import type { PluginIndexes, PluginQueryCondition } from "@tau/plugins/query";
import { invoke } from "@/electron";
import type { PluginRecordPage, PluginRecordQuery, PluginRecordRow } from "@/types/plugin-records";

/** 插件记录命令；调用方经 bindDatabaseCommands 固定到插件宿主的数据库 */
export const insertPluginRecord = (
  databaseName: string,
  pluginId: string,
  collection: string,
  id: string,
  data: Record<string, unknown>,
  indexes: PluginIndexes
): Promise<PluginRecordRow> =>
  invoke("plugin-records:insert", { databaseName, pluginId, collection, id, data, indexes });

export const getPluginRecord = (
  databaseName: string,
  pluginId: string,
  collection: string,
  id: string
): Promise<PluginRecordRow | null> =>
  invoke("plugin-records:get", { databaseName, pluginId, collection, id });

export const queryPluginRecords = (
  databaseName: string,
  pluginId: string,
  collection: string,
  query: PluginRecordQuery
): Promise<PluginRecordPage> =>
  invoke("plugin-records:query", { databaseName, pluginId, collection, query });

export const countPluginRecords = (
  databaseName: string,
  pluginId: string,
  collection: string,
  where: PluginQueryCondition[]
): Promise<number> => invoke("plugin-records:count", { databaseName, pluginId, collection, where });

export const updatePluginRecord = (
  databaseName: string,
  pluginId: string,
  collection: string,
  id: string,
  data: Record<string, unknown>,
  expectedRevision: string,
  indexes: PluginIndexes
): Promise<PluginRecordRow> =>
  invoke("plugin-records:update", {
    databaseName,
    pluginId,
    collection,
    id,
    data,
    expectedRevision,
    indexes,
  });

export const deletePluginRecord = (
  databaseName: string,
  pluginId: string,
  collection: string,
  id: string,
  expectedRevision: string
): Promise<void> =>
  invoke("plugin-records:delete", { databaseName, pluginId, collection, id, expectedRevision });
