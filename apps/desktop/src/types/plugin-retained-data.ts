/** 单个插件在当前资料库中的留存数据摘要（随库同步的部分） */
export interface PluginWorkspaceDataSummary {
  pluginId: string;
  entities: number;
  entityKinds: string[];
  records: number;
  kv: number;
  /** 关联、类型外观、引用授权、创建回执与操作快照等内部状态条数 */
  other: number;
  /** 最近一次写入时间戳（毫秒）；仅含无时间戳记录时为 null */
  updatedAt: number | null;
}

/** 单个插件在当前资料库对应的本机安全存储中的凭据数量 */
export interface PluginSecretCount {
  pluginId: string;
  count: number;
}

/** 合并当前资料库与本机凭据后的插件留存数据摘要 */
export interface RetainedPluginData extends PluginWorkspaceDataSummary {
  secrets: number;
}
