import type Database from "better-sqlite3";

type Handler = (...args: any[]) => any;
const asynchronousHandlers = new WeakSet<Handler>();

/** 异步编排自行在最终写入处开启同步事务，不能跨 IPC 或网络等待持有事务。 */
export function asynchronousDatabaseCommand<T extends (...args: any[]) => Promise<unknown>>(
  handler: T
): T {
  asynchronousHandlers.add(handler);
  return handler;
}

export function executeDatabaseCommand<T extends Handler>(
  database: Database.Database,
  handler: T,
  ...args: Parameters<T>
): ReturnType<T> {
  if (asynchronousHandlers.has(handler)) return handler(...args);
  return database.transaction(() => handler(...args))();
}
