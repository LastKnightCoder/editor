/** 写入时数据已被别处修改（expectedRevision 不是最新）：重新读取后再决定是否重试 */
export class PluginConflictError extends Error {
  override readonly name = "PluginConflictError";
  constructor(message = "数据已被修改，请重新读取后再试") {
    super(message);
  }
}

export type PluginSyncResetReason =
  | "invalid-cursor"
  | "query-changed"
  | "scope-changed"
  | "history-expired"
  | "history-replaced"
  | "protocol-changed";
/** 游标不再覆盖当前数据范围；保留映射并重新全量，不能将失败当作空结果。 */
export class PluginSyncResetRequiredError extends Error {
  override readonly name = "PluginSyncResetRequiredError";
  constructor(readonly reason: PluginSyncResetReason) {
    super(`业务变更游标已失效（${reason}），请重新全量读取`);
  }
}
