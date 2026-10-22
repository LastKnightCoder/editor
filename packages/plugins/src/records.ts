/**
 * 插件记录：插件内部使用的结构化数据（如分组、操作轨迹），用户看不到、不进搜索。
 * 随笔记库保存与同步；读写自己的记录不需要业务数据权限。用户能看见、能打开的内容用 context.entities。
 */
import type { Disposable } from "./contract";
import type { PluginPage, PluginWriteOptions } from "./data";
import type { JsonValue } from "./json";
import type { PluginIndexes, PluginOrderBy, PluginWhere } from "./query";

export type PluginRecordData = Record<string, JsonValue>;

export interface PluginRecord {
  /** 宿主生成的不透明 ID */
  id: string;
  collection: string;
  data: PluginRecordData;
  createdAt: number;
  updatedAt: number;
  /** update 与 delete 时作为 expectedRevision */
  revision: string;
}

export interface PluginRecordCollection {
  /** 插件内唯一的集合名 */
  name: string;
  /** 可用于 query 筛选与排序的 data 字段及类型，最多 16 个 */
  indexes?: PluginIndexes;
}

/** 记录自带的排序列；其余排序字段取集合声明的 indexes */
export type PluginRecordSortField = "createdAt" | "updatedAt";

export interface PluginRecordFilter {
  where?: PluginWhere;
}

export interface PluginRecordQuery extends PluginRecordFilter {
  /** 最多两项，ID 兜底；默认按创建时间升序 */
  orderBy?: PluginOrderBy | PluginOrderBy[];
  /** 原样传回上一页的 cursor；换了筛选或排序后不能再用 */
  cursor?: string;
  /** 默认 50，最多 200 */
  limit?: number;
}

export interface PluginRecords {
  /** 声明一个集合；读写只接受已声明的集合。在 activate 中声明，停用时自动撤销 */
  registerCollection(definition: PluginRecordCollection): Disposable;
  insert(collection: string, data: PluginRecordData): Promise<PluginRecord>;
  get(collection: string, id: string): Promise<PluginRecord | null>;
  query(collection: string, query?: PluginRecordQuery): Promise<PluginPage<PluginRecord>>;
  count(collection: string, filter?: PluginRecordFilter): Promise<number>;
  /** 整体替换 data；revision 不是最新时抛出 PluginConflictError */
  update(
    collection: string,
    id: string,
    data: PluginRecordData,
    options: PluginWriteOptions
  ): Promise<PluginRecord>;
  /** 直接删除，不进「最近删除」；revision 不是最新时抛出 PluginConflictError */
  delete(collection: string, id: string, options: PluginWriteOptions): Promise<void>;
}
