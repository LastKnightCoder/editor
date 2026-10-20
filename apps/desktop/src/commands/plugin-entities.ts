import { invoke } from "@/electron";
import type {
  PluginEntityCreate,
  PluginEntityPage,
  PluginEntityPatch,
  PluginEntityQuery,
  PluginEntityRecord,
} from "@/types/plugin-entities";

/** 插件实体命令；调用方经 bindDatabaseCommands 固定到插件宿主的数据库 */
export const createPluginEntity = (
  databaseName: string,
  pluginId: string,
  input: PluginEntityCreate
): Promise<PluginEntityRecord> =>
  invoke("plugin-entities:create", { databaseName, pluginId, input });

export const getPluginEntity = (
  databaseName: string,
  pluginId: string,
  id: number
): Promise<PluginEntityRecord | null> =>
  invoke("plugin-entities:get", { databaseName, pluginId, id });

export const findPluginEntity = (
  databaseName: string,
  pluginId: string,
  kind: string,
  key: string
): Promise<PluginEntityRecord | null> =>
  invoke("plugin-entities:find", { databaseName, pluginId, kind, key });

export const queryPluginEntities = (
  databaseName: string,
  pluginId: string,
  query: PluginEntityQuery
): Promise<PluginEntityPage> => invoke("plugin-entities:query", { databaseName, pluginId, query });

export const updatePluginEntity = (
  databaseName: string,
  pluginId: string,
  id: number,
  patch: PluginEntityPatch,
  expectedRevision: string
): Promise<PluginEntityRecord> =>
  invoke("plugin-entities:update", { databaseName, pluginId, id, patch, expectedRevision });
