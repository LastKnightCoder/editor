import Database from "better-sqlite3";
import { getDbPath } from "../utils/path.js";
import { notifyApp } from "./notify.js";
import { upgradeKnowledgeDatabase } from "@tau/db-schema/src/knowledge-migration-node";
import { retireSubscriptions } from "@tau/db-schema/src/subscription-retirement";
import { retireEditorBlocks } from "@tau/db-schema/src/editor-block-retirement";
import { migrateKnowledgeIndex } from "@tau/db-schema/src/knowledge-index-migration";
import { existsSync } from "node:fs";
import sqliteVec from "sqlite-vec";
import { getIndexDbPath } from "./index-db.js";

export interface DataAccessOptions {
  /** 同步下载等已另行保全副本的场景，迁移无需再留全量备份。 */
  skipMigrationBackup?: boolean;
}

export class DataAccess {
  private db: Database.Database;

  constructor(dbName = "data.db", options: DataAccessOptions = {}) {
    const dbPath = getDbPath(dbName);
    this.db = new Database(dbPath, { fileMustExist: true });
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    try {
      this.db.loadExtension(sqliteVec.getLoadablePath());
      retireSubscriptions(this.db, dbPath);
      upgradeKnowledgeDatabase(this.db, dbPath, { skipBackup: options.skipMigrationBackup });
      retireEditorBlocks(this.db, dbPath);
      const indexPath = getIndexDbPath(dbName);
      if (existsSync(indexPath)) {
        const index = new Database(indexPath);
        try {
          index.loadExtension(sqliteVec.getLoadablePath());
          migrateKnowledgeIndex(this.db, index);
        } finally {
          index.close();
        }
      }
    } catch (error) {
      this.db.close();
      throw error;
    }
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
    notificationData?: unknown
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
