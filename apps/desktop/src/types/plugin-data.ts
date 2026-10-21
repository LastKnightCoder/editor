/**
 * 插件业务数据命令的 IPC 契约：主进程按库读写并使用数字身份，渲染端适配层再转成
 * SDK 的不透明字符串 ID 与 ContentRef。主进程与渲染端共用，避免主进程反向依赖 app/plugins。
 */

export type PluginDataEntity = "card" | "article" | "document" | "whiteboard" | "project";
export type PluginWritableEntity = "card" | "article";
export type PluginCreatableEntity = PluginWritableEntity | "whiteboard" | "project";
/** 持有正文的实体 */
export type PluginContentOwnerEntity = "card" | "article" | "document";

export interface PluginDataScope {
  databaseName: string;
}

export interface PluginDataQuery {
  createdAfter?: number;
  createdBefore?: number;
  updatedAfter?: number;
  updatedBefore?: number;
  tag?: string;
  sort?: "created" | "updated";
  limit: number;
  /** 上一页最后一条的「排序时间:ID」 */
  cursor?: string;
}

export interface PluginDataRecord {
  entity: PluginDataEntity;
  id: number;
  /** 元数据修改时间，作为插件写入的 expectedRevision */
  revision: string;
  title: string;
  tags: string[];
  pinned: boolean;
  /** 白板等不挂正文的项目文档为 null */
  contentId: number | null;
  contentCreatedAt: number | null;
  wordCount: number;
  createdAt: number;
  updatedAt: number;
  /** 项目文档的类型（document / white-board …） */
  kind?: string;
  projectIds?: number[];
  /** 白板 */
  description?: string;
  pageCount?: number;
  /** 项目 */
  archived?: boolean;
  documentCount?: number;
}

export interface PluginDataPage {
  items: PluginDataRecord[];
  cursor?: string;
}

export interface PluginContentRecord {
  contentId: number;
  createdAt: number;
  updatedAt: number;
  /** 有协作会话时为会话版本，否则为 `u:修改时间` */
  revision: string;
  wordCount: number;
  markdown?: string;
  nodes?: unknown[];
  /** 引用这份正文的实体类型，供宿主按实体权限判断 */
  owners: PluginContentOwnerEntity[];
  /** 以这份正文为自有内容的插件实体：插件读写自己的正文不需要业务权限 */
  pluginOwners: PluginContentOwner[];
}

export interface PluginContentOwner {
  pluginId: string;
  /** 插件实体 ID */
  id: number;
  title: string;
}

/** 插件正文输入的 IPC 形式：copyOf 的 ContentRef 由渲染端解码为正文 ID 与创建时间 */
export type PluginContentSource =
  | { markdown: string }
  | { nodes: unknown[] }
  | { copyOf: { contentId: number; createdAt: number } };

export interface PluginDataCreateInput {
  content?: PluginContentSource;
  tags?: string[];
  pinned?: boolean;
  title?: string;
  /** 白板说明 */
  description?: string;
}

export type PluginContentEdit =
  | { op: "append"; content: PluginContentSource }
  | { op: "prepend"; content: PluginContentSource }
  | { op: "replaceText"; find: string; markdown: string }
  | { op: "replaceAll"; content: PluginContentSource };

/** 插件详情页列出的可恢复操作 */
export interface PluginOperationRecord {
  id: number;
  action: "delete";
  entity: "card" | "article" | "todo" | "event" | "plugin-entity";
  entityId: string;
  title: string;
  createdAt: number;
  restoredAt: number | null;
  /** 待办与日程：助理操作 ID，经 undo_task_operation 恢复 */
  operationId?: string;
  /** 插件内容：registerKind 声明的类型，用于显示类型名 */
  kind?: string;
}

/** 插件引用（kind 为 SDK 的 PluginEntityKind，id 为插件看到的不透明 ID） */
export interface PluginRefInput {
  kind: string;
  id: string;
}

export type PluginRefDescription =
  { status: "ok"; title: string } | { status: "missing" } | { status: "denied" };
