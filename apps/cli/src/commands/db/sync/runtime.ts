import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { loadSqliteVec } from "../../../data-access/sqlite-vec.js";
import {
  acquireDatabaseSyncLock,
  assertDatabaseSyncLockOwned,
  assertCompatibleSync,
  recoverSessionDownload,
  sessionDirectoryOf,
  readSnapshotHead,
} from "@tau/db-schema/sync";
import { closeDataAccess } from "../../../data-access/index.js";
import { isAppRunning } from "../../../data-access/notify.js";
import { rpcRequest } from "../../../data-access/rpc-client.js";
import { getDbPath } from "../../../utils/path.js";
import { updateDatabaseVersion } from "../../../utils/settings.js";
import type { ISyncProvider, IDatabaseInfo } from "../../../utils/sync-providers/types.js";

export async function readRemoteInfo(
  provider: ISyncProvider,
  name: string,
  required = false
): Promise<IDatabaseInfo> {
  const object = `database_${name}.json`;
  const info = await readSnapshotHead(provider, object);
  if (
    required &&
    info.version === 0 &&
    !info.databaseObject &&
    !(await provider.fileExists(object))
  )
    throw new Error("远端数据库不存在");
  if (!info || !Number.isSafeInteger(info.version) || info.version < 0)
    throw new Error("远端版本号无效");
  assertCompatibleSync(info);
  return info;
}

export interface SyncContext {
  assertLease(): void;
  databasePath: string;
  sessionDir: string;
  saveVersion(version: number): Promise<void>;
}

export function openSnapshotDatabase(path: string): Database.Database {
  const db = new Database(path, { readonly: true, fileMustExist: true });
  try {
    loadSqliteVec(db);
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

export async function withSyncDatabase<T>(
  name: string,
  direction: "push" | "pull",
  run: (context: SyncContext) => Promise<T>
): Promise<T> {
  if (!name || name.startsWith(".") || /[\\/]/.test(name)) throw new Error("非法数据库名");
  const databasePath = getDbPath(`${name.replace(/\.db$/, "")}.db`);
  if (!existsSync(databasePath)) throw new Error("本地数据库不存在，请先创建数据库");
  mkdirSync(dirname(databasePath), { recursive: true });
  closeDataAccess();
  const release = acquireDatabaseSyncLock(databasePath);
  let token: string | undefined;
  let failure: unknown;
  let failed = false;
  let result!: T;
  try {
    if (await isAppRunning()) {
      const lease = await rpcRequest<{ token: string }>("cli-sync:begin", [name, direction], {
        timeoutMs: 30000,
      });
      if (!lease?.token) throw new Error("桌面端不支持配对同步，请升级桌面端");
      token = lease.token;
    }
    recoverSessionDownload(databasePath);
    result = await run({
      assertLease: () => assertDatabaseSyncLockOwned(databasePath),
      databasePath,
      sessionDir: sessionDirectoryOf(databasePath),
      saveVersion: async version => {
        assertDatabaseSyncLockOwned(databasePath);
        if (token) await rpcRequest("cli-sync:version", [token, version]);
        else updateDatabaseVersion(name, version);
      },
    });
  } catch (error) {
    failure = error;
    failed = true;
  } finally {
    try {
      release();
    } catch (error) {
      if (!failed) {
        failure = error;
        failed = true;
      }
    }
    if (token) {
      try {
        await rpcRequest("cli-sync:finish", [token], { timeoutMs: 120000 });
      } catch (error) {
        if (!failed) {
          failure = error;
          failed = true;
        } else console.error("同步失败后的桌面重连也失败：", error);
      }
    }
  }
  if (failed) throw failure;
  return result;
}
