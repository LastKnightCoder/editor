import type { Disposable } from "./contract";
import type { PluginPermission } from "./permissions";

/**
 * 业务数据变更事件。事件只说明「哪一项变了」，不携带数据：需要时用 context.data 重新读取。
 * 正文修改计入所属卡片、文章、项目文档或插件实体的 updated；Notebook 资料的增删改计入所属
 * Notebook 的 updated；待办与日程只给出集合级变化。entity.* 是本插件实体（context.entities）的变化，
 * 只发给拥有它的插件。
 */
export const PLUGIN_EVENT_TYPES = [
  "card.created",
  "card.updated",
  "card.deleted",
  "article.created",
  "article.updated",
  "article.deleted",
  "document.created",
  "document.updated",
  "document.deleted",
  "whiteboard.created",
  "whiteboard.updated",
  "whiteboard.deleted",
  "project.created",
  "project.updated",
  "project.deleted",
  "notebook.created",
  "notebook.updated",
  "notebook.deleted",
  "material.created",
  "material.updated",
  "material.deleted",
  "chat.created",
  "chat.updated",
  "chat.deleted",
  "entity.created",
  "entity.updated",
  "entity.deleted",
  "todos.changed",
  "calendar.changed",
  "workspace.reset",
] as const;

export type PluginEventType = (typeof PLUGIN_EVENT_TYPES)[number];

/** 变化来自哪里：插件经 context.data / context.content 写入时为 plugin，其余（用户、同步、AI 等）为 app */
export type PluginEventOrigin = { kind: "plugin"; pluginId: string } | { kind: "app" };

export interface PluginDomainEvent {
  type: PluginEventType;
  /** 实体事件给出与 context.data / context.entities 相同的 ID；集合级事件没有 */
  id?: string;
  /** entity.* 事件给出实体类型（registerKind 声明的 kind）；删除后读不到实体时据此区分 */
  kind?: string;
  /** 宿主发出事件的时间（毫秒） */
  at: number;
  /** 用来忽略自己写入引起的事件；待办与日程的集合级事件恒为 app */
  origin: PluginEventOrigin;
}

/** 接收事件需要对应数据的读取权限；未获准时事件不送达，也不会弹窗询问 */
export const PLUGIN_EVENT_PERMISSIONS: Record<PluginEventType, PluginPermission | null> = {
  "card.created": "cards:read",
  "card.updated": "cards:read",
  "card.deleted": "cards:read",
  "article.created": "articles:read",
  "article.updated": "articles:read",
  "article.deleted": "articles:read",
  "document.created": "documents:read",
  "document.updated": "documents:read",
  "document.deleted": "documents:read",
  "whiteboard.created": "whiteboards:read",
  "whiteboard.updated": "whiteboards:read",
  "whiteboard.deleted": "whiteboards:read",
  "project.created": "projects:read",
  "project.updated": "projects:read",
  "project.deleted": "projects:read",
  "notebook.created": "notebooks:read",
  "notebook.updated": "notebooks:read",
  "notebook.deleted": "notebooks:read",
  "material.created": "materials:read",
  "material.updated": "materials:read",
  "material.deleted": "materials:read",
  "chat.created": "chats:read",
  "chat.updated": "chats:read",
  "chat.deleted": "chats:read",
  // 本插件实体：读写自己的实体不需要权限
  "entity.created": null,
  "entity.updated": null,
  "entity.deleted": null,
  "todos.changed": "todos:read",
  "calendar.changed": "calendar:read",
  // 同步下载替换了整个库：插件应全量刷新
  "workspace.reset": null,
};

export const isPluginEventType = (value: unknown): value is PluginEventType =>
  typeof value === "string" && value in PLUGIN_EVENT_PERMISSIONS;

export interface PluginEvents {
  on(
    types: PluginEventType | readonly PluginEventType[],
    listener: (event: PluginDomainEvent) => void
  ): Disposable;
}
