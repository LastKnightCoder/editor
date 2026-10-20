/** 写入时数据已被别处修改（expectedRevision 不是最新）：重新读取后再决定是否重试 */
export class PluginConflictError extends Error {
  override readonly name = "PluginConflictError";
  constructor(message = "数据已被修改，请重新读取后再试") {
    super(message);
  }
}
