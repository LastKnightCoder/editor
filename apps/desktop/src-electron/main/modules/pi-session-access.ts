/** 会话文件的同步租约：在异步创建或替换开始前占位，避免检查与登记之间出现第二个写入者。 */
export class PiSessionAccess {
  private readonly held = new Set<string>();

  acquire(keys: string[]): () => void {
    keys = keys.map(key => key.replace(/\\/g, "/").replace(/\/$/, ""));
    if (process.platform === "win32") keys = keys.map(key => key.toLowerCase());
    if (
      keys.some(key =>
        [...this.held].some(
          held => key === held || key.startsWith(`${held}/`) || held.startsWith(`${key}/`)
        )
      )
    )
      throw new Error("对话正在打开或修改，请稍后重试");
    keys.forEach(key => this.held.add(key));
    return () => keys.forEach(key => this.held.delete(key));
  }
}
