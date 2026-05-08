import Database from "better-sqlite3";
import { getDbPath } from "../utils/path.js";
import { notifyApp } from "./notify.js";

export class DataAccess {
  private db: Database.Database;

  constructor(dbName = "data.db") {
    const dbPath = getDbPath(dbName);
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
  }

  query<T = unknown>(sql: string, ...params: unknown[]): T[] {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as T[];
  }

  queryOne<T = unknown>(sql: string, ...params: unknown[]): T | undefined {
    const stmt = this.db.prepare(sql);
    return stmt.get(...params) as T | undefined;
  }

  exec(sql: string, ...params: unknown[]): Database.RunResult {
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
    notificationData?: unknown,
  ): Promise<Database.RunResult> {
    const result = this.exec(sql, ...params);
    if (notificationMethod) {
      notifyApp(notificationMethod, notificationData).catch(() => {});
    }
    return result;
  }

  getDatabase(): Database.Database {
    return this.db;
  }

  close() {
    this.db.close();
  }
}

let defaultInstance: DataAccess | null = null;

export function getDataAccess(dbName = "data.db"): DataAccess {
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
