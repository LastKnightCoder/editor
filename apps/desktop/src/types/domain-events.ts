/** 主进程 `domain-events` 广播的载荷，主进程与渲染端共用；ID 为数字，渲染端再转成插件 ID。 */
export interface DomainEventRecord {
  type:
    | "card.created"
    | "card.updated"
    | "card.deleted"
    | "article.created"
    | "article.updated"
    | "article.deleted"
    | "document.created"
    | "document.updated"
    | "document.deleted"
    | "todos.changed"
    | "calendar.changed"
    | "workspace.reset";
  id?: number;
  at: number;
  /** 由插件经 plugin-data 写入时为插件 ID */
  pluginId?: string;
}

export interface DomainEventMessage {
  databaseName: string;
  events: DomainEventRecord[];
}
