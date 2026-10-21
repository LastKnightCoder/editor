import type { PluginEventType } from "@tau/plugins";

/**
 * 主进程 `domain-events` 广播的载荷，主进程与渲染端共用。数字 ID 由渲染端转成插件 ID；
 * 材料（如 `excerpt:12`）与对话的 ID 本来就是字符串。
 */
export interface DomainEventRecord {
  type: PluginEventType;
  id?: number | string;
  at: number;
  /** 由插件经 plugin-data 写入时为插件 ID */
  pluginId?: string;
  /** entity.*：拥有该实体的插件与实体类型 */
  owner?: string;
  kind?: string;
}

export interface DomainEventMessage {
  databaseName: string;
  events: DomainEventRecord[];
}
