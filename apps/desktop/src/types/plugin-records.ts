/** 插件记录（context.records）的 IPC 契约，主进程与渲染端共用。 */
import type { PluginIndexes, PluginQueryCondition, PluginQueryOrder } from "@tau/plugins/query";
import type { PluginEntityScope } from "./plugin-entities";

export interface PluginRecordScope extends PluginEntityScope {
  collection: string;
}

export interface PluginRecordRow {
  id: string;
  collection: string;
  data: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
  revision: string;
}

export interface PluginRecordInsert extends PluginRecordScope {
  /** PluginHost 生成的 ID */
  id: string;
  data: Record<string, unknown>;
  /** 集合声明的索引字段，写入前核对 data */
  indexes?: PluginIndexes;
}

export interface PluginRecordUpdate extends PluginRecordInsert {
  /** 省略时不核对版本（事务里的无条件写入） */
  expectedRevision?: string;
}

export interface PluginRecordQuery {
  where?: PluginQueryCondition[];
  orderBy: PluginQueryOrder[];
  cursor?: string;
  limit: number;
}

export interface PluginRecordCount extends PluginRecordScope {
  where?: PluginQueryCondition[];
}

export interface PluginRecordPage {
  items: PluginRecordRow[];
  cursor?: string;
}
