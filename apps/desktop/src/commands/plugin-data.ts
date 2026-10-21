import type { PluginNotebookResource } from "@tau/plugins";
import type { Descendant } from "slate";
import { invoke } from "@/electron";
import type { NotebookPlan } from "@/types/vibe-learning";
import type {
  PluginContentEdit,
  PluginContentRecord,
  PluginContentSource,
  PluginCreatableEntity,
  PluginDataCreateInput,
  PluginDataEntity,
  PluginDataPage,
  PluginDataQuery,
  PluginDataRecord,
  PluginDocumentCreateInput,
  PluginDocumentMoveInput,
  PluginOperationRecord,
  PluginProjectNodeRecord,
  PluginReadonlyEntity,
  PluginReadonlyPage,
  PluginReadonlyRecord,
  PluginRefDescription,
  PluginRefInput,
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

/** Notebook、材料与对话的只读访问，返回插件看到的形状 */
export const queryPluginReadonlyData = (
  databaseName: string,
  entity: PluginReadonlyEntity,
  query: PluginDataQuery
): Promise<PluginReadonlyPage> =>
  invoke("plugin-data:readonly-query", { databaseName, entity, query });

export const getPluginReadonlyData = (
  databaseName: string,
  entity: PluginReadonlyEntity,
  id: string
): Promise<PluginReadonlyRecord | null> =>
  invoke("plugin-data:readonly-get", { databaseName, entity, id });

export const getPluginNotebookResources = (
  databaseName: string,
  notebookId: number
): Promise<PluginNotebookResource[] | null> =>
  invoke("plugin-data:notebook-resources", { databaseName, notebookId });

/** 插件 notebook.create 的资料计划，只在宿主确认框中使用 */
export const planPluginNotebook = (
  databaseName: string,
  refs: PluginRefInput[]
): Promise<NotebookPlan> => invoke("plugin-refs:notebook-plan", { databaseName, refs });

/** 把插件的正文输入解析为节点，供宿主界面预填；结果不交给插件 */
export const resolvePluginContentInput = (
  databaseName: string,
  content: PluginContentSource
): Promise<Descendant[]> => invoke("plugin-data:resolve-content", { databaseName, content });

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
  entity: PluginDataEntity,
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
): Promise<{ entity: PluginDataEntity | "plugin-entity"; id: number }> =>
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

export const getPluginProjectTree = (
  databaseName: string,
  projectId: number
): Promise<PluginProjectNodeRecord[] | null> =>
  invoke("plugin-data:project-tree", { databaseName, projectId });

export const createPluginDocument = (
  databaseName: string,
  pluginId: string,
  input: PluginDocumentCreateInput
): Promise<PluginDataRecord> =>
  invoke("plugin-data:create-document", { databaseName, pluginId, input });

export const movePluginDocument = (
  databaseName: string,
  pluginId: string,
  id: number,
  move: PluginDocumentMoveInput,
  expectedRevision: string
): Promise<{ revision: string }> =>
  invoke("plugin-data:move-document", { databaseName, pluginId, id, move, expectedRevision });
