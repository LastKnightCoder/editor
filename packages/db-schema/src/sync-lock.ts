import lockfile from "proper-lockfile";
import { resolve } from "node:path";

const options = { realpath: false, stale: 120_000, update: 5_000 };
const owned = new Set<string>();

/** 同一个库的桌面与 CLI 同步互斥；进程退出释放，崩溃遗留锁在心跳过期后可恢复。 */
export function acquireDatabaseSyncLock(databasePath: string): () => void {
  try {
    const path = resolve(databasePath);
    const release = lockfile.lockSync(path, options);
    owned.add(path);
    return () => {
      try {
        release();
      } finally {
        owned.delete(path);
      }
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ELOCKED")
      throw new Error("此数据库正在同步，请稍后重试");
    throw error;
  }
}

export const isDatabaseSyncLocked = (databasePath: string): boolean =>
  lockfile.checkSync(databasePath, options);

export function assertDatabaseNotSyncing(databasePath: string, allowOwned = false): void {
  if (allowOwned && owned.has(resolve(databasePath))) return;
  if (isDatabaseSyncLocked(databasePath)) throw new Error("此数据库正在同步，请稍后重试");
}
