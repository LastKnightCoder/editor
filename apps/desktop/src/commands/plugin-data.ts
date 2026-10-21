import { invoke } from "@/electron";
import type {
  PluginContentEdit,
  PluginContentRecord,
  PluginCreatableEntity,
  PluginDataCreateInput,
  PluginDataEntity,
  PluginDataPage,
  PluginDataQuery,
  PluginDataRecord,
  PluginOperationRecord,
  PluginRefDescription,
  PluginRefInput,
  PluginWritableEntity,
} from "@/types/plugin-data";

/** 插件业务数据命令；调用方经 bindDatabaseCommands 固定到插件宿主的数据库 */
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

export const createPluginData = (
  databaseName: string,
  pluginId: string,
  entity: PluginCreatableEntity,
  input: PluginDataCreateInput
): Promise<PluginDataRecord> =>
  invoke("plugin-data:create", { databaseName, pluginId, entity, input });

export const updatePluginData = (
  databaseName: string,
  pluginId: string,
  entity: PluginDataEntity,
  id: number,
  patch: unknown,
  expectedRevision: string
): Promise<PluginDataRecord> =>
  invoke("plugin-data:update", { databaseName, pluginId, entity, id, patch, expectedRevision });

export const deletePluginData = (
  databaseName: string,
  pluginId: string,
  entity: PluginWritableEntity,
  id: number,
  expectedRevision: string
): Promise<void> =>
  invoke("plugin-data:delete", { databaseName, pluginId, entity, id, expectedRevision });

export const editPluginContent = (
  databaseName: string,
  pluginId: string,
  contentId: number,
  createdAt: number,
  edit: PluginContentEdit,
  expectedRevision: string
): Promise<{ revision: string }> =>
  invoke("plugin-data:edit-content", {
    databaseName,
    pluginId,
    contentId,
    createdAt,
    edit,
    expectedRevision,
  });

export const listPluginOperations = (
  databaseName: string,
  pluginId: string
): Promise<PluginOperationRecord[]> => invoke("plugin-data:operations", { databaseName, pluginId });

export const recordPluginOperation = (
  databaseName: string,
  operation: {
    pluginId: string;
    entity: "todo" | "event";
    entityId: string;
    title: string;
    operationId: string;
  }
): Promise<void> => invoke("plugin-data:record-operation", { databaseName, ...operation });

export const restorePluginOperation = (
  databaseName: string,
  id: number
): Promise<{ entity: PluginWritableEntity | "plugin-entity"; id: number }> =>
  invoke("plugin-data:restore", { databaseName, id });

export const markPluginOperationRestored = (databaseName: string, id: number): Promise<void> =>
  invoke("plugin-data:mark-restored", { databaseName, id });

export const pluginRefExists = (databaseName: string, kind: string, id: string): Promise<boolean> =>
  invoke("plugin-refs:exists", { databaseName, kind, id });

/** 登记用户在选择窗口中为插件选中的引用 */
export const grantPluginRefs = (
  databaseName: string,
  pluginId: string,
  refs: PluginRefInput[]
): Promise<number> => invoke("plugin-refs:grant", { databaseName, pluginId, refs });

export const describePluginRefs = (
  databaseName: string,
  pluginId: string,
  refs: PluginRefInput[],
  readable: string[]
): Promise<PluginRefDescription[]> =>
  invoke("plugin-refs:describe", { databaseName, pluginId, refs, readable });

export const clearPluginRefGrants = (databaseName: string, pluginId: string): Promise<number> =>
  invoke("plugin-refs:clear", { databaseName, pluginId });
