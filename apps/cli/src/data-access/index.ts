import Database from "better-sqlite3";
import { getDbPath } from "../utils/path.js";
import { notifyApp } from "./notify.js";
import { upgradeKnowledgeDatabase } from "@tau/db-schema/src/knowledge-migration-node";
import { retireSubscriptions } from "@tau/db-schema/src/subscription-retirement";
import { retireFeatureTables } from "@tau/db-schema/src/feature-table-retirement";
import { retirePlannedTodos } from "@tau/db-schema/src/planned-retirement";
import { retireEditorBlocks } from "@tau/db-schema/src/editor-block-retirement";
import { retireContentLink } from "@tau/db-schema/src/content-link-retirement";
import { migrateKnowledgeIndex } from "@tau/db-schema/src/knowledge-index-migration";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import sqliteVec from "sqlite-vec";
import { getIndexDbPath } from "./index-db.js";
import { assertDatabaseNotSyncing, recoverSessionDownload } from "@tau/db-schema/sync";

export interface DataAccessOptions {
  databasePath?: string;
  migrateIndex?: boolean;
  allowOwnedSync?: boolean;
  /** 同步下载等已另行保全副本的场景，迁移无需再留全量备份。 */
  skipMigrationBackup?: boolean;
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
      this.db.loadExtension(sqliteVec.getLoadablePath());
      retireSubscriptions(this.db, dbPath);
      retireFeatureTables(this.db, dbPath);
      retirePlannedTodos(this.db, dbPath);
      upgradeKnowledgeDatabase(this.db, dbPath, { skipBackup: options.skipMigrationBackup });
      retireContentLink(this.db, dbPath);
      retireEditorBlocks(this.db, dbPath);
      const indexPath = getIndexDbPath(dbName);
      if (options.migrateIndex !== false && existsSync(indexPath)) {
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
