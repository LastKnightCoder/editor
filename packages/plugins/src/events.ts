import type { Disposable } from "./contract";
import type { PluginPermission } from "./permissions";

/**
 * 业务数据变更事件。事件只说明「哪一项变了」，不携带数据：需要时用 context.data 重新读取。
 * 正文修改计入所属卡片、文章、项目文档或插件实体的 updated；Notebook 资料的增删改计入所属
 * Notebook 的 updated；待办、日程和目录使用相同的对象动作事件。entity.* 与 record.* 是本插件实体
 * （context.entities）与记录（context.records）的变化，只发给拥有它的插件。
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
  "record.created",
  "record.updated",
  "record.deleted",
  "todo.created",
  "todo.updated",
  "todo.deleted",
  "event.created",
  "event.updated",
  "event.deleted",
  "todo-list.created",
  "todo-list.updated",
  "todo-list.deleted",
  "calendar.created",
  "calendar.updated",
  "calendar.deleted",
  "workspace.reset",
] as const;

export type PluginEventType = (typeof PLUGIN_EVENT_TYPES)[number];

/** 能识别插件写入方时提供 pluginId；app 也包含不能细分写入方的通知。 */
export type PluginEventOrigin = { kind: "plugin"; pluginId: string } | { kind: "app" };

interface PluginEventFields {
  kind?: string;
  collection?: string;
  /** 宿主送出通知的时间（毫秒），不是业务版本。 */
  at: number;
  /** 待办、日程、目录事件不提供精确写入方，固定为 app。 */
  origin: PluginEventOrigin;
}

export type PluginEvent<T extends PluginEventType = PluginEventType> = T extends "workspace.reset"
  ? PluginEventFields & { type: T; id?: never }
  : PluginEventFields & { type: T; id: string };

export type PluginDomainEvent = PluginEvent;

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
  // 本插件实体与记录：读写自己的数据不需要权限
  "entity.created": null,
  "entity.updated": null,
  "entity.deleted": null,
  "record.created": null,
  "record.updated": null,
  "record.deleted": null,
  "todo.created": "todos:read",
  "todo.updated": "todos:read",
  "todo.deleted": "todos:read",
  "event.created": "calendar:read",
  "event.updated": "calendar:read",
  "event.deleted": "calendar:read",
  "todo-list.created": "todos:read",
  "todo-list.updated": "todos:read",
  "todo-list.deleted": "todos:read",
  "calendar.created": "calendar:read",
  "calendar.updated": "calendar:read",
  "calendar.deleted": "calendar:read",
  // 同步下载替换了整个库：插件应全量刷新
  "workspace.reset": null,
};

export const isPluginEventType = (value: unknown): value is PluginEventType =>
  typeof value === "string" && Object.hasOwn(PLUGIN_EVENT_PERMISSIONS, value);

export interface PluginEvents {
  /** 同一订阅按序处理；异步回调等待完成，返回值不作为结果。 */
  on<T extends PluginEventType>(
    types: T | readonly T[],
    listener: (event: PluginEvent<T>) => void
  ): Disposable;
}
