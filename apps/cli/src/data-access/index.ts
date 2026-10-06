import Database from "better-sqlite3";
import { getDbPath } from "../utils/path.js";
import { notifyApp } from "./notify.js";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { loadSqliteVec } from "./sqlite-vec.js";
import { assertNoLegacyTables } from "@tau/db-schema/src/legacy-table-guard";
import { assertDatabaseNotSyncing, recoverSessionDownload } from "@tau/db-schema/sync";

export interface DataAccessOptions {
  databasePath?: string;
  allowOwnedSync?: boolean;
}

export class DataAccess {
  private db: Database.Database;
  private readonly allowOwnedSync: boolean;
  private readonly fileIdentity: { dev: number; ino: number };

  constructor(dbName = "data.db", options: DataAccessOptions = {}) {
    this.allowOwnedSync = options.allowOwnedSync === true;
    const dbPath = options.databasePath ?? getDbPath(dbName);
    assertDatabaseNotSyncing(dbPath, options.allowOwnedSync);
    recoverSessionDownload(dbPath);
    this.db = new Database(dbPath, { fileMustExist: true });
    this.fileIdentity = statSync(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    try {
      loadSqliteVec(this.db);
      // 数据基线门禁：与桌面同一接受边界，未完成最后升级的旧库拒绝进入
      assertNoLegacyTables(this.db);
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  query<T = unknown>(sql: string, ...params: unknown[]): T[] {
    this.assertAvailable();
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as T[];
  }

  queryOne<T = unknown>(sql: string, ...params: unknown[]): T | undefined {
    this.assertAvailable();
    const stmt = this.db.prepare(sql);
    return stmt.get(...params) as T | undefined;
  }

  exec(sql: string, ...params: unknown[]): Database.RunResult {
    this.assertAvailable();
    const stmt = this.db.prepare(sql);
    return stmt.run(...params);
  }

  /**
   * Execute a write operation and notify the running app (if any) to refresh UI.
   * The notification is fire-and-forget — it does not block the CLI.
   */
  async write(
    sql: string,
    params: unknown[],
    notificationMethod?: string,
    notificationData?: unknown
  ): Promise<Database.RunResult> {
    const result = this.exec(sql, ...params);
    if (notificationMethod) {
      notifyApp(notificationMethod, notificationData).catch(() => {});
    }
    return result;
  }

  getDatabase(): Database.Database {
    this.assertAvailable();
    return this.db;
  }

  close() {
    if (this.db.open) this.db.close();
  }

  isCurrent(path = this.db.name): boolean {
    if (!this.db.open || resolve(path) !== resolve(this.db.name) || !existsSync(path)) return false;
    const stat = statSync(path);
    return stat.ino === this.fileIdentity.ino && stat.dev === this.fileIdentity.dev;
  }

  private assertAvailable(): void {
    assertDatabaseNotSyncing(this.db.name, this.allowOwnedSync);
    if (!this.isCurrent()) throw new Error("数据库已被同步替换，请重新执行操作");
  }
}

let defaultInstance: DataAccess | null = null;

export function getDataAccess(dbName = "data.db"): DataAccess {
  if (defaultInstance && !defaultInstance.isCurrent(getDbPath(dbName))) {
    defaultInstance.close();
    defaultInstance = null;
  }
  if (!defaultInstance) {
    defaultInstance = new DataAccess(dbName);
  }
  return defaultInstance;
}

export function closeDataAccess() {
  if (defaultInstance) {
    defaultInstance.close();
    defaultInstance = null;
  }
}
