/**
 * 业务事件的来源标记：插件经 plugin-data 写入时登记插件 ID，domain-events 的触发器回调据此标出 origin。
 * 不依赖数据库模块，供表模块与事件模块共用而不形成循环引用。
 */

/** 协作会话的正文修改在会话投影时才落库（约 1 秒后），按正文登记一段时间内的来源 */
const CONTENT_ORIGIN_TTL_MS = 5000;

let current: string | undefined;
const contentOrigins = new Map<string, { pluginId: string; until: number }>();

/** 在同步写入期间标记来源；better-sqlite3 的触发器在写入语句内同步执行 */
export function writeAsPlugin<T>(pluginId: string, write: () => T): T {
  const previous = current;
  current = pluginId;
  try {
    return write();
  } finally {
    current = previous;
  }
}

export const currentPluginOrigin = () => current;

export function markContentOrigin(dbName: string, contentId: number, pluginId: string) {
  contentOrigins.set(`${dbName}\n${contentId}`, {
    pluginId,
    until: Date.now() + CONTENT_ORIGIN_TTL_MS,
  });
}

export function contentOrigin(dbName: string, contentId: number): string | undefined {
  const key = `${dbName}\n${contentId}`;
  const mark = contentOrigins.get(key);
  if (!mark) return undefined;
  if (mark.until < Date.now()) {
    contentOrigins.delete(key);
    return undefined;
  }
  return mark.pluginId;
}
