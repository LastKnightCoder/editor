import Database from "better-sqlite3";
import { join } from "node:path";
import log from "electron-log";
import * as sqliteVec from "sqlite-vec";
import PathUtil from "../utils/PathUtil";

export type IndexMigrationState = "init" | "copying" | "cutover" | "done";
export type IndexRebuildState = "pending" | "building" | "ready" | "failed";

const MIGRATION_STATE_KEY = "migration_state";
const REBUILD_STATE_KEY = "rebuild_state";
const UPDATED_AT_KEY = "updated_at";

interface CopyResult {
  sourceExists: boolean;
  copied: boolean;
  rowCount: number;
  error?: string;
}

class MainContentIndexDBManager {
  private databases: Map<string, Database.Database> = new Map();

  private normalizeMainDbName(mainDbName: string): string {
    return mainDbName.endsWith(".db") ? mainDbName : `${mainDbName}.db`;
  }

  private getMainDbBaseName(mainDbName: string): string {
    return this.normalizeMainDbName(mainDbName).replace(/\.db$/, "");
  }

  private getDatabasePath(mainDbName: string): string {
    return join(
      PathUtil.getAppDir(),
      `${this.getMainDbBaseName(mainDbName)}.index.db`,
    );
  }

  private getDatabaseKey(mainDbName: string): string {
    return this.normalizeMainDbName(mainDbName);
  }

  private hasTable(db: Database.Database, tableName: string): boolean {
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
      )
      .get(tableName);
    return !!row;
  }

  private escapeSqlString(input: string): string {
    return input.replace(/'/g, "''");
  }

  private getMainDbPath(mainDb: Database.Database): string | null {
    const databaseList = mainDb.pragma("database_list") as Array<{
      name: string;
      file: string;
    }>;
    const main = databaseList.find((item) => item.name === "main");
    return main?.file || null;
  }

  private initSchema(indexDb: Database.Database) {
    indexDb.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS content_fts USING fts5(
        prefixed_id,
        update_time,
        content,
        type,
        title,
        chunk_index,
        tokenize='porter unicode61'
      )
    `);

    indexDb.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_documents USING vec0(
        prefixed_id TEXT,
        update_time FLOAT,
        content TEXT,
        type TEXT,
        vec_embedding FLOAT[3072] distance_metric=cosine
      )
    `);

    indexDb.exec(`
      CREATE TABLE IF NOT EXISTS vec_index_meta (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at INTEGER
      )
    `);

    indexDb.exec(`
      CREATE TABLE IF NOT EXISTS index_meta (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at INTEGER
      )
    `);

    if (!this.getMeta(indexDb, MIGRATION_STATE_KEY)) {
      this.setMeta(indexDb, MIGRATION_STATE_KEY, "init");
    }
    if (!this.getMeta(indexDb, REBUILD_STATE_KEY)) {
      this.setMeta(indexDb, REBUILD_STATE_KEY, "pending");
    }
  }

  private getMeta(db: Database.Database, key: string): string | null {
    const row = db
      .prepare("SELECT value FROM index_meta WHERE key = ?")
      .get(key) as { value?: string } | undefined;
    return row?.value || null;
  }

  private setMeta(db: Database.Database, key: string, value: string) {
    const now = Date.now();
    db.prepare(
      `
      INSERT INTO index_meta (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `,
    ).run(key, value, now);
  }

  private copyVecIndexMeta(
    mainDb: Database.Database,
    indexDb: Database.Database,
  ): CopyResult {
    if (!this.hasTable(mainDb, "vec_index_meta")) {
      return { sourceExists: false, copied: false, rowCount: 0 };
    }
    try {
      const rows = mainDb
        .prepare("SELECT key, value, updated_at FROM vec_index_meta")
        .all() as Array<{
        key: string;
        value: string;
        updated_at: number;
      }>;
      const stmt = indexDb.prepare(
        `
        INSERT INTO vec_index_meta (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `,
      );
      for (const row of rows) {
        stmt.run(row.key, row.value, row.updated_at || Date.now());
      }
      return {
        sourceExists: true,
        copied: true,
        rowCount: rows.length,
      };
    } catch (error) {
      log.warn("[MainContentIndexDB] Copy vec_index_meta failed:", error);
      return {
        sourceExists: true,
        copied: false,
        rowCount: 0,
        error: String(error),
      };
    }
  }

  private copyFtsFromMain(
    mainDb: Database.Database,
    indexDb: Database.Database,
  ): CopyResult {
    if (!this.hasTable(mainDb, "content_fts")) {
      return { sourceExists: false, copied: false, rowCount: 0 };
    }
    const mainDbPath = this.getMainDbPath(mainDb);
    if (!mainDbPath) {
      return {
        sourceExists: true,
        copied: false,
        rowCount: 0,
        error: "main db path not found",
      };
    }

    const escaped = this.escapeSqlString(mainDbPath);
    const alias = "main_content_src";
    try {
      const sourceCount =
        (
          mainDb.prepare("SELECT COUNT(1) AS count FROM content_fts").get() as
            | { count?: number }
            | undefined
        )?.count || 0;
      indexDb.exec(`ATTACH DATABASE '${escaped}' AS ${alias}`);
      indexDb.exec("DELETE FROM content_fts");

      // 探测源表的实际列，兼容旧版 Schema（无 title / chunk_index）
      const sourceColumns = (
        mainDb.pragma("table_xinfo(content_fts)") as Array<{ name: string }>
      ).map((c) => c.name);
      const hasTitle = sourceColumns.includes("title");
      const hasChunkIndex = sourceColumns.includes("chunk_index");

      const selectCols = [
        "prefixed_id",
        "update_time",
        "content",
        "type",
        hasTitle ? "title" : "NULL",
        hasChunkIndex ? "chunk_index" : "NULL",
      ].join(", ");

      indexDb.exec(`
        INSERT INTO content_fts (prefixed_id, update_time, content, type, title, chunk_index)
        SELECT ${selectCols}
        FROM ${alias}.content_fts
      `);
      return {
        sourceExists: true,
        copied: true,
        rowCount: sourceCount,
      };
    } catch (error) {
      log.warn("[MainContentIndexDB] Copy content_fts failed:", error);
      return {
        sourceExists: true,
        copied: false,
        rowCount: 0,
        error: String(error),
      };
    } finally {
      try {
        indexDb.exec(`DETACH DATABASE ${alias}`);
      } catch {
        // ignore detach error
      }
    }
  }

  private copyVecFromMain(
    mainDb: Database.Database,
    indexDb: Database.Database,
  ): CopyResult {
    if (!this.hasTable(mainDb, "vec_documents")) {
      return { sourceExists: false, copied: false, rowCount: 0 };
    }

    const sourceSql = mainDb
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'vec_documents'",
      )
      .get() as { sql?: string } | undefined;

    if (!sourceSql?.sql) {
      return {
        sourceExists: true,
        copied: false,
        rowCount: 0,
        error: "source vec_documents sql not found",
      };
    }

    const mainDbPath = this.getMainDbPath(mainDb);
    if (!mainDbPath) {
      return {
        sourceExists: true,
        copied: false,
        rowCount: 0,
        error: "main db path not found",
      };
    }

    const escaped = this.escapeSqlString(mainDbPath);
    const alias = "main_vec_src";

    try {
      const sourceCount =
        (
          mainDb
            .prepare("SELECT COUNT(1) AS count FROM vec_documents")
            .get() as { count?: number } | undefined
        )?.count || 0;
      indexDb.exec("DROP TABLE IF EXISTS vec_documents");
      indexDb.exec(sourceSql.sql);
      indexDb.exec(`ATTACH DATABASE '${escaped}' AS ${alias}`);
      indexDb.exec(`
        INSERT INTO vec_documents (prefixed_id, update_time, content, type, vec_embedding)
        SELECT prefixed_id, update_time, content, type, vec_embedding
        FROM ${alias}.vec_documents
      `);
      return {
        sourceExists: true,
        copied: true,
        rowCount: sourceCount,
      };
    } catch (error) {
      log.warn("[MainContentIndexDB] Copy vec_documents failed:", error);
      return {
        sourceExists: true,
        copied: false,
        rowCount: 0,
        error: String(error),
      };
    } finally {
      try {
        indexDb.exec(`DETACH DATABASE ${alias}`);
      } catch {
        // ignore detach error
      }
    }
  }

  getDatabase(mainDbName: string): Database.Database {
    const key = this.getDatabaseKey(mainDbName);
    const existed = this.databases.get(key);
    if (existed) {
      log.debug(
        `[MainContentIndexDB] Reuse index database connection: mainDb=${key}`,
      );
      return existed;
    }

    const dbPath = this.getDatabasePath(mainDbName);
    log.info(
      `[MainContentIndexDB] Open index database: mainDb=${key}, indexDbPath=${dbPath}`,
    );
    const db = new Database(dbPath);
    sqliteVec.load(db);
    db.pragma("journal_mode = WAL");
    this.initSchema(db);
    this.databases.set(key, db);
    return db;
  }

  getMigrationState(mainDbName: string): IndexMigrationState {
    const indexDb = this.getDatabase(mainDbName);
    const value = this.getMeta(indexDb, MIGRATION_STATE_KEY);
    if (
      value === "init" ||
      value === "copying" ||
      value === "cutover" ||
      value === "done"
    ) {
      return value;
    }
    return "init";
  }

  getRebuildState(mainDbName: string): IndexRebuildState {
    const indexDb = this.getDatabase(mainDbName);
    const value = this.getMeta(indexDb, REBUILD_STATE_KEY);
    if (
      value === "pending" ||
      value === "building" ||
      value === "ready" ||
      value === "failed"
    ) {
      return value;
    }
    return "pending";
  }

  setRebuildState(mainDbName: string, state: IndexRebuildState) {
    const indexDb = this.getDatabase(mainDbName);
    this.setMeta(indexDb, REBUILD_STATE_KEY, state);
    this.setMeta(indexDb, UPDATED_AT_KEY, String(Date.now()));
  }

  ensureReady(mainDbName: string, mainDb: Database.Database) {
    const startAt = Date.now();
    const indexDb = this.getDatabase(mainDbName);
    const migrationState = this.getMigrationState(mainDbName);
    const rebuildState = this.getRebuildState(mainDbName);
    log.info(
      `[MainContentIndexDB] ensureReady start: mainDb=${mainDbName}, migrationState=${migrationState}, rebuildState=${rebuildState}`,
    );
    if (migrationState === "done") {
      log.info(
        `[MainContentIndexDB] ensureReady skip: mainDb=${mainDbName}, migrationState=done, rebuildState=${rebuildState}, elapsedMs=${Date.now() - startAt}`,
      );
      return {
        migrationState,
        rebuildState,
      };
    }

    this.setMeta(indexDb, MIGRATION_STATE_KEY, "copying");
    this.setMeta(indexDb, REBUILD_STATE_KEY, "building");
    log.info(
      `[MainContentIndexDB] migration state update: mainDb=${mainDbName}, migrationState=copying, rebuildState=building`,
    );

    const copyStartAt = Date.now();
    const ftsResult = this.copyFtsFromMain(mainDb, indexDb);
    const vecResult = this.copyVecFromMain(mainDb, indexDb);
    const vecMetaResult = this.copyVecIndexMeta(mainDb, indexDb);
    log.info(
      `[MainContentIndexDB] migration copy summary: mainDb=${mainDbName}, ftsSource=${ftsResult.sourceExists}, ftsCopied=${ftsResult.copied}, ftsRows=${ftsResult.rowCount}, vecSource=${vecResult.sourceExists}, vecCopied=${vecResult.copied}, vecRows=${vecResult.rowCount}, vecMetaSource=${vecMetaResult.sourceExists}, vecMetaCopied=${vecMetaResult.copied}, vecMetaRows=${vecMetaResult.rowCount}, copyElapsedMs=${Date.now() - copyStartAt}`,
    );
    if (ftsResult.error) {
      log.warn(
        `[MainContentIndexDB] migration copy fts error: mainDb=${mainDbName}, error=${ftsResult.error}`,
      );
    }
    if (vecResult.error) {
      log.warn(
        `[MainContentIndexDB] migration copy vec error: mainDb=${mainDbName}, error=${vecResult.error}`,
      );
    }
    if (vecMetaResult.error) {
      log.warn(
        `[MainContentIndexDB] migration copy vec meta error: mainDb=${mainDbName}, error=${vecMetaResult.error}`,
      );
    }

    this.setMeta(indexDb, MIGRATION_STATE_KEY, "cutover");
    log.info(
      `[MainContentIndexDB] migration state update: mainDb=${mainDbName}, migrationState=cutover`,
    );

    const droppedTables: string[] = [];
    try {
      mainDb.exec("DROP TABLE IF EXISTS content_fts");
      droppedTables.push("content_fts");
      mainDb.exec("DROP TABLE IF EXISTS vec_documents");
      droppedTables.push("vec_documents");
      mainDb.exec("DROP TABLE IF EXISTS vec_index_meta");
      droppedTables.push("vec_index_meta");
      log.info(
        `[MainContentIndexDB] drop legacy tables success: mainDb=${mainDbName}, dropped=${droppedTables.join(",")}`,
      );
    } catch (error) {
      log.warn("[MainContentIndexDB] Drop legacy index tables failed:", error);
    }

    if (!this.hasTable(indexDb, "vec_documents")) {
      this.initTableFallback(indexDb);
      log.info(
        `[MainContentIndexDB] vec table fallback initialized: mainDb=${mainDbName}, vecDimensions=3072`,
      );
    }

    const nextRebuildState: IndexRebuildState =
      ftsResult.copied || vecResult.copied ? "ready" : "pending";
    this.setMeta(indexDb, MIGRATION_STATE_KEY, "done");
    this.setMeta(indexDb, REBUILD_STATE_KEY, nextRebuildState);
    log.info(
      `[MainContentIndexDB] migration state update: mainDb=${mainDbName}, migrationState=done, rebuildState=${nextRebuildState}, elapsedMs=${Date.now() - startAt}`,
    );

    return {
      migrationState: this.getMigrationState(mainDbName),
      rebuildState: this.getRebuildState(mainDbName),
    };
  }

  closeDatabase(mainDbName: string) {
    const key = this.getDatabaseKey(mainDbName);
    const db = this.databases.get(key);
    if (!db) return;
    try {
      db.close();
    } catch (error) {
      log.error("[MainContentIndexDB] close database failed:", error);
    } finally {
      this.databases.delete(key);
    }
  }

  closeAll() {
    for (const [key, db] of this.databases.entries()) {
      try {
        db.close();
      } catch (error) {
        log.error(`[MainContentIndexDB] close database failed: ${key}`, error);
      }
      this.databases.delete(key);
    }
  }

  private initTableFallback(indexDb: Database.Database) {
    indexDb.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_documents USING vec0(
        prefixed_id TEXT,
        update_time FLOAT,
        content TEXT,
        type TEXT,
        vec_embedding FLOAT[3072] distance_metric=cosine
      )
    `);
  }
}

export default new MainContentIndexDBManager();
