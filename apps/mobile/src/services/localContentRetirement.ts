type Retirement = { finish(): Promise<void>; running?: Promise<void> };
const pending = new Map<string, Set<Retirement>>();

function finish(key: string, entry: Retirement): Promise<void> {
  if (entry.running) return entry.running;
  // 等本轮子级 effect 清理完成，确保编辑器已冲刷输入字段。
  entry.running = Promise.resolve()
    .then(entry.finish)
    .then(() => {
      const entries = pending.get(key);
      entries?.delete(entry);
      if (!entries?.size) pending.delete(key);
    })
    .finally(() => {
      entry.running = undefined;
    });
  return entry.running;
}

/** 保存失败的会话继续持有输入；重新打开同一正文前先重试收尾。 */
export function retireLocalContent(key: string, close: () => Promise<void>) {
  const entries = pending.get(key) ?? new Set<Retirement>();
  const entry = { finish: close };
  entries.add(entry);
  pending.set(key, entries);
  void finish(key, entry).catch(error => console.error("[local-content] close failed", error));
}

export async function flushRetiredLocalContent(key: string) {
  for (const entry of [...(pending.get(key) ?? [])]) await finish(key, entry);
}
