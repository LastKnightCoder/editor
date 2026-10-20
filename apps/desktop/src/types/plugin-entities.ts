/**
 * 插件实体（插件自建、带一份正文的内容）的 IPC 契约。主进程与渲染端共用，避免主进程反向依赖 app/plugins。
 */
import type { PluginDataScope } from "./plugin-data";

export interface PluginEntityRecord {
  id: number;
  pluginId: string;
  kind: string;
  key: string;
  title: string;
  contentId: number;
  contentCreatedAt: number;
  meta: Record<string, unknown>;
  createdAt: number;
  /** 元数据与正文中较新的修改时间 */
  updatedAt: number;
  /** 元数据修改时间，作为 update 的 expectedRevision */
  revision: string;
}

export interface PluginEntityScope extends PluginDataScope {
  pluginId: string;
}

export interface PluginEntityQuery {
  kind?: string;
  cursor?: string;
  limit: number;
}

export interface PluginEntityPage {
  items: PluginEntityRecord[];
  cursor?: string;
}

export interface PluginEntityCreate {
  kind: string;
  key: string;
  title: string;
  meta: Record<string, unknown>;
}

export interface PluginEntityPatch {
  title?: string;
  meta?: Record<string, unknown>;
}
