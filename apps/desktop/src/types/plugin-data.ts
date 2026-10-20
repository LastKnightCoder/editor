/**
 * 插件业务数据只读命令的 IPC 契约：主进程按库查询并返回数字身份，渲染端适配层再转成
 * SDK 的不透明字符串 ID 与 ContentRef。主进程与渲染端共用，避免主进程反向依赖 app/plugins。
 */

export type PluginDataEntity = "card" | "article" | "document";

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
}

export interface PluginDataPage {
  items: PluginDataRecord[];
  cursor?: string;
}

export interface PluginContentRecord {
  contentId: number;
  createdAt: number;
  updatedAt: number;
  wordCount: number;
  markdown?: string;
  nodes?: unknown[];
  /** 引用这份正文的实体类型，供宿主按实体权限判断 */
  owners: PluginDataEntity[];
}
