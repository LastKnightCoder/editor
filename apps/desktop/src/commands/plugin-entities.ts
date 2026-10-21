import type { PluginIndexes } from "@tau/plugins/query";
import { invoke } from "@/electron";
import type {
  PluginEntityCreate,
  PluginEntityFilter,
  PluginEntityKindAppearance,
  PluginEntityOwner,
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

export const countPluginEntities = (
  databaseName: string,
  pluginId: string,
  filter: PluginEntityFilter
): Promise<number> => invoke("plugin-entities:count", { databaseName, pluginId, filter });

export const updatePluginEntity = (
  databaseName: string,
  pluginId: string,
  id: number,
  patch: PluginEntityPatch,
  expectedRevision: string,
  indexes: Record<string, PluginIndexes>
): Promise<PluginEntityRecord> =>
  invoke("plugin-entities:update", {
    databaseName,
    pluginId,
    id,
    patch,
    expectedRevision,
    indexes,
  });

/** 宿主按 ID 读取任意插件的实体（检索结果打开、通用只读页） */
export const locatePluginEntity = (
  databaseName: string,
  id: number
): Promise<PluginEntityRecord | null> => invoke("plugin-entities:locate", { databaseName, id });

export const deletePluginEntity = (
  databaseName: string,
  pluginId: string,
  id: number,
  expectedRevision: string
): Promise<void> =>
  invoke("plugin-entities:delete", { databaseName, pluginId, id, expectedRevision });

/** 一批插件内容所属的插件与类型（各处按声明的外观显示） */
export const pluginEntityOwners = (
  databaseName: string,
  ids: number[]
): Promise<PluginEntityOwner[]> => invoke("plugin-entities:owners", { databaseName, ids });

/** 保存插件声明的类型外观，返回是否有变化 */
export const declarePluginEntityKind = (
  databaseName: string,
  pluginId: string,
  appearance: PluginEntityKindAppearance
): Promise<boolean> =>
  invoke("plugin-entities:declare-kind", { databaseName, pluginId, ...appearance });

export const listPluginEntityKinds = (
  databaseName: string
): Promise<Array<PluginEntityKindAppearance & { pluginId: string }>> =>
  invoke("plugin-entities:kinds", { databaseName });
