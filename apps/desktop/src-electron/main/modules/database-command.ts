import type Database from "better-sqlite3";

const asynchronousHandlers = new WeakSet<object>();

/** 异步编排自行在最终写入处开启同步事务，不能跨 IPC 或网络等待持有事务。 */
export function asynchronousDatabaseCommand<A extends unknown[], R>(
  handler: (...args: A) => Promise<R>
): (...args: A) => Promise<R> {
  asynchronousHandlers.add(handler);
  return handler;
}

export function executeDatabaseCommand<A extends unknown[], R>(
  database: Database.Database,
  handler: (...args: A) => R,
  ...args: A
): R {
  if (asynchronousHandlers.has(handler)) return handler(...args);
  return database.transaction(() => handler(...args))();
}
