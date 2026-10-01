import Database from "better-sqlite3";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { basename, join } from "node:path";
import log from "electron-log";
import PathUtil from "../utils/PathUtil";
import { loadSqliteVecExtension } from "../utils/sqlite-vec-loader";
import INDEX_SCHEMA_SQL from "@tau/db-schema/schema/index.sql?raw";
import { migrateKnowledgeIndex } from "@tau/db-schema/src/knowledge-index-migration";
import INDEX_VEC_TEMPLATE_SQL from "@tau/db-schema/schema/index/20_vec_template.sql?raw";
import {
  ensureIndexDbDir,
  getIndexDbDir,
  migrateDbFileWithSidecars,
  normalizeMainDbBase,
  scanLegacyDbFiles,
} from "./utils/index-db-storage";
import KnowledgeMapTable from "./tables/knowledge-map";

export type IndexMigrationState = "init" | "copying" | "cutover" | "done";
export type IndexRebuildState = "pending" | "building" | "ready" | "failed";
export type IndexRebuildTarget = "aggregate" | "fts" | "vec";

export interface EnsureIndexReadyResult {
  migrationState: IndexMigrationState;
  rebuildState: IndexRebuildState;
}

const MIGRATION_STATE_KEY = "migration_state";
const LEGACY_MAIN_INDEX_TABLES = ["content_fts", "vec_documents", "vec_index_meta"];
const REBUILD_STATE_KEY = "rebuild_state";
const FTS_REBUILD_STATE_KEY = "fts_rebuild_state";
const VEC_REBUILD_STATE_KEY = "vec_rebuild_state";
const UPDATED_AT_KEY = "updated_at";
const DEFAULT_VEC_DIMENSION = 3072;

interface CopyResult {
  sourceExists: boolean;
  copied: boolean;
  rowCount: number;
  error?: string;
}

class MainContentIndexDBManager {
  private databases: Map<string, Database.Database> = new Map();
  private legacyScanCompleted = false;

  private normalizeRebuildState(value: string | null | undefined): IndexRebuildState {
    if (value === "pending" || value === "building" || value === "ready" || value === "failed") {
      return value;
    }
    return "pending";
  }

  private getRebuildStateKey(target: IndexRebuildTarget): string {
    if (target === "fts") {
      return FTS_REBUILD_STATE_KEY;
    }
    if (target === "vec") {
      return VEC_REBUILD_STATE_KEY;
    }
    return REBUILD_STATE_KEY;
  }

  private combineRebuildStates(states: IndexRebuildState[]): IndexRebuildState {
    if (states.includes("failed")) {
      return "failed";
    }
    if (states.includes("building")) {
      return "building";
    }
    if (states.includes("pending")) {
      return "pending";
    }
    return "ready";
  }

  private ensureScopedRebuildStates(indexDb: Database.Database): void {
    const aggregate = this.normalizeRebuildState(this.getMeta(indexDb, REBUILD_STATE_KEY));

    if (!this.getMeta(indexDb, FTS_REBUILD_STATE_KEY)) {
      this.setMeta(indexDb, FTS_REBUILD_STATE_KEY, aggregate);
    }
    if (!this.getMeta(indexDb, VEC_REBUILD_STATE_KEY)) {
      this.setMeta(indexDb, VEC_REBUILD_STATE_KEY, aggregate);
    }
    this.syncAggregateRebuildState(indexDb);
  }

  private syncAggregateRebuildState(indexDb: Database.Database): IndexRebuildState {
    const nextAggregate = this.combineRebuildStates([
      this.normalizeRebuildState(this.getMeta(indexDb, FTS_REBUILD_STATE_KEY)),
      this.normalizeRebuildState(this.getMeta(indexDb, VEC_REBUILD_STATE_KEY)),
    ]);
    this.setMeta(indexDb, REBUILD_STATE_KEY, nextAggregate);
    return nextAggregate;
  }

  private readRebuildState(
    indexDb: Database.Database,
    target: IndexRebuildTarget
  ): IndexRebuildState {
    this.ensureScopedRebuildStates(indexDb);
    return this.normalizeRebuildState(this.getMeta(indexDb, this.getRebuildStateKey(target)));
  }

  private writeRebuildState(
    indexDb: Database.Database,
    state: IndexRebuildState,
    target: IndexRebuildTarget
  ): IndexRebuildState {
    this.ensureScopedRebuildStates(indexDb);
    this.setMeta(indexDb, this.getRebuildStateKey(target), state);
    const aggregate = target === "aggregate" ? state : this.syncAggregateRebuildState(indexDb);
    this.setMeta(indexDb, UPDATED_AT_KEY, String(Date.now()));
    return aggregate;
  }

  private normalizeMainDbName(mainDbName: string): string {
    return mainDbName.endsWith(".db") ? mainDbName : `${mainDbName}.db`;
  }

  private getMainDbBaseName(mainDbName: string): string {
    return normalizeMainDbBase(this.normalizeMainDbName(mainDbName));
  }

  private getDatabasePath(mainDbName: string): string {
    const baseName = this.getMainDbBaseName(mainDbName);
    return join(getIndexDbDir(`${baseName}.db`), `${baseName}.index.db`);
  }

  private getLegacyDatabasePath(mainDbName: string): string {
    const baseName = this.getMainDbBaseName(mainDbName);
    return join(PathUtil.getAppDir(), `${baseName}.index.db`);
  }

  private getDatabaseKey(mainDbName: string): string {
    return this.normalizeMainDbName(mainDbName);
  }

  private hasTable(db: Database.Database, tableName: string): boolean {
    const row = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
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
    const main = databaseList.find(item => item.name === "main");
    return main?.file || null;
  }

  private resolveVecDimensionsFromSetting(): number {
    const startedAt = Date.now();
    try {
      const settingPath = join(PathUtil.getAppDir(), "setting.json");
      if (!existsSync(settingPath)) {
        log.info(
          `[MainContentIndexDB] resolveVecDimensions fallback default: reason=setting_missing, elapsedMs=${Date.now() - startedAt}`
        );
        return DEFAULT_VEC_DIMENSION;
      }
      const raw = readFileSync(settingPath, "utf8");
      if (!raw.trim()) {
        log.info(
          `[MainContentIndexDB] resolveVecDimensions fallback default: reason=setting_empty, elapsedMs=${Date.now() - startedAt}`
        );
        return DEFAULT_VEC_DIMENSION;
      }
      const setting = JSON.parse(raw) as {
        embeddingProvider?: {
          currentConfigId?: string;
          configs?: Array<{
            id?: string;
            currentModel?: string;
            models?: Array<{ name?: string; contextLength?: number }>;
          }>;
        };
      };
      const provider = setting.embeddingProvider;
      if (!provider?.currentConfigId || !provider.configs?.length) {
        log.info(
          `[MainContentIndexDB] resolveVecDimensions fallback default: reason=config_missing, elapsedMs=${Date.now() - startedAt}`
        );
        return DEFAULT_VEC_DIMENSION;
      }
      const currentConfig = provider.configs.find(config => config.id === provider.currentConfigId);
      if (!currentConfig?.currentModel || !currentConfig.models?.length) {
        log.info(
          `[MainContentIndexDB] resolveVecDimensions fallback default: reason=model_missing, elapsedMs=${Date.now() - startedAt}`
        );
        return DEFAULT_VEC_DIMENSION;
      }
      const model = currentConfig.models.find(item => item.name === currentConfig.currentModel);
      const dimension = Number(model?.contextLength ?? 0);
      if (!Number.isFinite(dimension) || dimension <= 0) {
        log.info(
          `[MainContentIndexDB] resolveVecDimensions fallback default: reason=dimension_invalid, elapsedMs=${Date.now() - startedAt}`
        );
        return DEFAULT_VEC_DIMENSION;
      }
      log.info(
        `[MainContentIndexDB] resolveVecDimensions success: dimensions=${Math.floor(dimension)}, elapsedMs=${Date.now() - startedAt}`
      );
      return Math.floor(dimension);
    } catch (error) {
      log.warn(
        "[MainContentIndexDB] resolveVecDimensionsFromSetting failed, fallback default:",
        error
      );
      return DEFAULT_VEC_DIMENSION;
    }
  }

  private buildVecTableSql(vecDimensions: number): string {
    const normalized =
      Number.isFinite(vecDimensions) && vecDimensions > 0
        ? Math.floor(vecDimensions)
        : DEFAULT_VEC_DIMENSION;
    return INDEX_VEC_TEMPLATE_SQL.replace(/__VEC_DIMENSION__/g, String(normalized));
  }

  private parseVecDimensions(createSql: string): number | null {
    const matched = createSql.match(/FLOAT\[(\d+)\]/i);
    if (!matched) {
      return null;
    }
    const parsed = Number.parseInt(matched[1], 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }
    return parsed;
  }

  private getCurrentVecDimensions(indexDb: Database.Database): number | null {
    const row = indexDb
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'vec_documents'")
      .get() as { sql?: string } | undefined;
    if (!row?.sql) {
      return null;
    }
    return this.parseVecDimensions(row.sql);
  }

  private ensureVecTableByDimensions(indexDb: Database.Database, vecDimensions: number): boolean {
    const target =
      Number.isFinite(vecDimensions) && vecDimensions > 0
        ? Math.floor(vecDimensions)
        : DEFAULT_VEC_DIMENSION;
    const current = this.getCurrentVecDimensions(indexDb);

    if (current === target) {
      return false;
    }

    indexDb.exec("DROP TABLE IF EXISTS vec_documents");
    indexDb.exec(this.buildVecTableSql(target));
    log.info(
      `[MainContentIndexDB] vec_documents recreated: old=${current ?? "none"}, new=${target}`
    );
    return true;
  }

  private initSchema(indexDb: Database.Database) {
    const startedAt = Date.now();
    const schemaStartAt = Date.now();
    // 旧版地图表以 card_id 为主键，CREATE IF NOT EXISTS 不会改它，先删掉（可重算）
    KnowledgeMapTable.migrateLegacy(indexDb);
    indexDb.exec(INDEX_SCHEMA_SQL);
    log.info(
      `[MainContentIndexDB] initSchema base schema done: elapsedMs=${Date.now() - schemaStartAt}`
    );

    const dimensionStartAt = Date.now();
    const vecDimensions = this.resolveVecDimensionsFromSetting();
    log.info(
      `[MainContentIndexDB] initSchema resolve dimensions done: vecDimensions=${vecDimensions}, elapsedMs=${Date.now() - dimensionStartAt}`
    );

    const vecStartAt = Date.now();
    const vecRecreated = this.ensureVecTableByDimensions(indexDb, vecDimensions);
    log.info(
      `[MainContentIndexDB] initSchema ensure vec table done: vecDimensions=${vecDimensions}, vecRecreated=${vecRecreated}, elapsedMs=${Date.now() - vecStartAt}`
    );

    if (!this.getMeta(indexDb, MIGRATION_STATE_KEY)) {
      this.setMeta(indexDb, MIGRATION_STATE_KEY, "init");
    }
    if (!this.getMeta(indexDb, REBUILD_STATE_KEY)) {
      this.setMeta(indexDb, REBUILD_STATE_KEY, "pending");
    }
    this.ensureScopedRebuildStates(indexDb);
    if (vecRecreated) {
      this.writeRebuildState(indexDb, "pending", "vec");
    }
    log.info(
      `[MainContentIndexDB] initSchema done: vecDimensions=${vecDimensions}, vecRecreated=${vecRecreated}, totalElapsedMs=${Date.now() - startedAt}`
    );
  }

  private getMeta(db: Database.Database, key: string): string | null {
    const row = db.prepare("SELECT value FROM index_meta WHERE key = ?").get(key) as
      { value?: string } | undefined;
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
    `
    ).run(key, value, now);
  }

  private copyVecIndexMeta(mainDb: Database.Database, indexDb: Database.Database): CopyResult {
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
      `
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

  private copyFtsFromMain(mainDb: Database.Database, indexDb: Database.Database): CopyResult {
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
            { count?: number } | undefined
        )?.count || 0;
      indexDb.exec(`ATTACH DATABASE '${escaped}' AS ${alias}`);
      indexDb.exec("DELETE FROM content_fts");

      // 探测源表的实际列，兼容旧版 Schema（无 title / chunk_index）
      const sourceColumns = (
        mainDb.pragma("table_xinfo(content_fts)") as Array<{ name: string }>
      ).map(c => c.name);
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

  private copyVecFromMain(mainDb: Database.Database, indexDb: Database.Database): CopyResult {
    if (!this.hasTable(mainDb, "vec_documents")) {
      return { sourceExists: false, copied: false, rowCount: 0 };
    }

    const sourceSql = mainDb
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'vec_documents'")
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
          mainDb.prepare("SELECT COUNT(1) AS count FROM vec_documents").get() as
            { count?: number } | undefined
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

  private migrateLegacyDatabaseFor(mainDbName: string): void {
    const startedAt = Date.now();
    const legacyPath = this.getLegacyDatabasePath(mainDbName);
    const targetPath = this.getDatabasePath(mainDbName);
    try {
      const result = migrateDbFileWithSidecars(legacyPath, targetPath);
      if (result.reason === "source_not_found") {
        return;
      }
      log.info(
        `[MainContentIndexDB] migrate legacy file: source=${result.source}, target=${result.target}, moved=${result.moved}, skipped=${result.skipped}, reason=${result.reason}, elapsedMs=${Date.now() - startedAt}`
      );
    } catch (error) {
      log.warn(
        `[MainContentIndexDB] migrate legacy file failed: source=${legacyPath}, target=${targetPath}, error=${error}, elapsedMs=${Date.now() - startedAt}`
      );
    }
  }

  private scanAndMigrateLegacyDatabases(): void {
    const startedAt = Date.now();
    if (this.legacyScanCompleted) {
      return;
    }
    this.legacyScanCompleted = true;

    let found = 0;
    let migrated = 0;
    let skipped = 0;
    let failed = 0;

    try {
      const { files } = scanLegacyDbFiles(fileName => fileName.endsWith(".index.db"));
      found = files.length;
      for (const legacyPath of files) {
        const fileName = basename(legacyPath);
        const mainDbBase = fileName.slice(0, -".index.db".length);
        const mainDbName = `${mainDbBase}.db`;
        const targetPath = this.getDatabasePath(mainDbName);
        try {
          const result = migrateDbFileWithSidecars(legacyPath, targetPath);
          if (result.moved) {
            migrated += 1;
          } else {
            skipped += 1;
          }
          log.info(
            `[MainContentIndexDB] startup migration: source=${result.source}, target=${result.target}, moved=${result.moved}, skipped=${result.skipped}, reason=${result.reason}`
          );
        } catch (error) {
          failed += 1;
          log.warn(
            `[MainContentIndexDB] startup migration failed: source=${legacyPath}, target=${targetPath}, error=${error}`
          );
        }
      }
    } catch (error) {
      failed += 1;
      log.warn(`[MainContentIndexDB] startup migration scan failed: ${error}`);
    }

    log.info(
      `[MainContentIndexDB] startup migration summary: found=${found}, migrated=${migrated}, skipped=${skipped}, failed=${failed}, elapsedMs=${Date.now() - startedAt}`
    );
  }

  getDatabase(mainDbName: string): Database.Database {
    const startedAt = Date.now();
    this.scanAndMigrateLegacyDatabases();
    this.migrateLegacyDatabaseFor(mainDbName);
    ensureIndexDbDir(mainDbName);

    const key = this.getDatabaseKey(mainDbName);
    const existed = this.databases.get(key);
    if (existed) {
      log.debug(
        `[MainContentIndexDB] Reuse index database connection: mainDb=${key}, elapsedMs=${Date.now() - startedAt}`
      );
      return existed;
    }

    const dbPath = this.getDatabasePath(mainDbName);
    log.info(`[MainContentIndexDB] Open index database: mainDb=${key}, indexDbPath=${dbPath}`);
    const db = new Database(dbPath);
    const extensionStartAt = Date.now();
    loadSqliteVecExtension(db);
    log.info(
      `[MainContentIndexDB] Open index database load sqlite-vec done: mainDb=${key}, elapsedMs=${Date.now() - extensionStartAt}`
    );

    const pragmaStartAt = Date.now();
    db.pragma("journal_mode = WAL");
    log.info(
      `[MainContentIndexDB] Open index database journal_mode done: mainDb=${key}, elapsedMs=${Date.now() - pragmaStartAt}`
    );

    const schemaStartAt = Date.now();
    this.initSchema(db);
    log.info(
      `[MainContentIndexDB] Open index database initSchema done: mainDb=${key}, elapsedMs=${Date.now() - schemaStartAt}`
    );
    this.databases.set(key, db);
    log.info(
      `[MainContentIndexDB] Open index database done: mainDb=${key}, totalElapsedMs=${Date.now() - startedAt}`
    );
    return db;
  }

  getMigrationState(mainDbName: string): IndexMigrationState {
    const indexDb = this.getDatabase(mainDbName);
    const value = this.getMeta(indexDb, MIGRATION_STATE_KEY);
    if (value === "init" || value === "copying" || value === "cutover" || value === "done") {
      return value;
    }
    return "init";
  }

  getRebuildState(mainDbName: string, target: IndexRebuildTarget = "aggregate"): IndexRebuildState {
    const indexDb = this.getDatabase(mainDbName);
    return this.readRebuildState(indexDb, target);
  }

  setRebuildState(
    mainDbName: string,
    state: IndexRebuildState,
    target: IndexRebuildTarget = "aggregate"
  ) {
    const indexDb = this.getDatabase(mainDbName);
    this.writeRebuildState(indexDb, state, target);
  }

  ensureReady(mainDbName: string, mainDb: Database.Database): EnsureIndexReadyResult {
    const startAt = Date.now();
    const indexDb = this.getDatabase(mainDbName);
    const migrationState = this.getMigrationState(mainDbName);
    const rebuildState = this.getRebuildState(mainDbName);
    const vecDimensions = this.resolveVecDimensionsFromSetting();
    log.info(
      `[MainContentIndexDB] ensureReady start: mainDb=${mainDbName}, migrationState=${migrationState}, rebuildState=${rebuildState}`
    );
    if (migrationState === "done") {
      // 索引早已搬到独立索引库：主库里又出现的旧索引表（另一台还没搬过的机器同步上来的 .db 带着）
      // 不会再被读，只会占空间并跟着同步来回传，删掉
      this.dropLegacyMainIndexTables(mainDb, mainDbName);
      migrateKnowledgeIndex(mainDb, indexDb);
      const vecRecreated = this.ensureVecTableByDimensions(indexDb, vecDimensions);
      if (vecRecreated) {
        this.writeRebuildState(indexDb, "pending", "vec");
      }
      const nextRebuildState = this.getRebuildState(mainDbName);
      log.info(
        `[MainContentIndexDB] ensureReady skip: mainDb=${mainDbName}, migrationState=done, rebuildState=${nextRebuildState}, vecDimensions=${vecDimensions}, elapsedMs=${Date.now() - startAt}`
      );
      return {
        migrationState,
        rebuildState: nextRebuildState,
      };
    }

    this.setMeta(indexDb, MIGRATION_STATE_KEY, "copying");
    this.writeRebuildState(indexDb, "building", "fts");
    this.writeRebuildState(indexDb, "building", "vec");
    log.info(
      `[MainContentIndexDB] migration state update: mainDb=${mainDbName}, migrationState=copying, rebuildState=building`
    );

    const copyStartAt = Date.now();
    const ftsResult = this.copyFtsFromMain(mainDb, indexDb);
    const vecResult = this.copyVecFromMain(mainDb, indexDb);
    const vecMetaResult = this.copyVecIndexMeta(mainDb, indexDb);
    log.info(
      `[MainContentIndexDB] migration copy summary: mainDb=${mainDbName}, ftsSource=${ftsResult.sourceExists}, ftsCopied=${ftsResult.copied}, ftsRows=${ftsResult.rowCount}, vecSource=${vecResult.sourceExists}, vecCopied=${vecResult.copied}, vecRows=${vecResult.rowCount}, vecMetaSource=${vecMetaResult.sourceExists}, vecMetaCopied=${vecMetaResult.copied}, vecMetaRows=${vecMetaResult.rowCount}, copyElapsedMs=${Date.now() - copyStartAt}`
    );
    if (ftsResult.error) {
      log.warn(
        `[MainContentIndexDB] migration copy fts error: mainDb=${mainDbName}, error=${ftsResult.error}`
      );
    }
    if (vecResult.error) {
      log.warn(
        `[MainContentIndexDB] migration copy vec error: mainDb=${mainDbName}, error=${vecResult.error}`
      );
    }
    if (vecMetaResult.error) {
      log.warn(
        `[MainContentIndexDB] migration copy vec meta error: mainDb=${mainDbName}, error=${vecMetaResult.error}`
      );
    }

    this.setMeta(indexDb, MIGRATION_STATE_KEY, "cutover");
    log.info(
      `[MainContentIndexDB] migration state update: mainDb=${mainDbName}, migrationState=cutover`
    );

    this.dropLegacyMainIndexTables(mainDb, mainDbName);

    const vecRecreated = this.ensureVecTableByDimensions(indexDb, vecDimensions);

    const nextFtsRebuildState: IndexRebuildState = ftsResult.copied ? "ready" : "pending";
    const nextVecRebuildState: IndexRebuildState = vecRecreated
      ? "pending"
      : vecResult.copied
        ? "ready"
        : "pending";
    migrateKnowledgeIndex(mainDb, indexDb);
    this.setMeta(indexDb, MIGRATION_STATE_KEY, "done");
    this.writeRebuildState(indexDb, nextFtsRebuildState, "fts");
    const nextRebuildState = this.writeRebuildState(indexDb, nextVecRebuildState, "vec");
    log.info(
      `[MainContentIndexDB] migration state update: mainDb=${mainDbName}, migrationState=done, rebuildState=${nextRebuildState}, ftsRebuildState=${nextFtsRebuildState}, vecRebuildState=${nextVecRebuildState}, vecDimensions=${vecDimensions}, vecRecreated=${vecRecreated}, elapsedMs=${Date.now() - startAt}`
    );

    return {
      migrationState: this.getMigrationState(mainDbName),
      rebuildState: this.getRebuildState(mainDbName),
    };
  }

  /** 主库里的旧索引表（索引已搬到独立索引库）：搬完时删，之后主库再带着也删 */
  private dropLegacyMainIndexTables(mainDb: Database.Database, mainDbName: string) {
    const legacy = LEGACY_MAIN_INDEX_TABLES.filter(name => this.hasTable(mainDb, name));
    if (legacy.length === 0) return;
    try {
      for (const name of legacy) mainDb.exec(`DROP TABLE IF EXISTS ${name}`);
      log.info(
        `[MainContentIndexDB] drop legacy tables success: mainDb=${mainDbName}, dropped=${legacy.join(",")}`
      );
    } catch (error) {
      log.warn("[MainContentIndexDB] Drop legacy index tables failed:", error);
    }
  }

  getExistingDatabase(mainDbName: string): Database.Database | undefined {
    return this.databases.get(this.getDatabaseKey(mainDbName));
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
        log.error(`[MainContentIndexDB] close database failed: key=${key}, error=${error}`);
      }
      this.databases.delete(key);
    }
  }

  resetDatabase(mainDbName: string) {
    this.closeDatabase(mainDbName);
    const path = this.getDatabasePath(mainDbName);
    for (const suffix of ["", "-wal", "-shm"]) {
      const file = `${path}${suffix}`;
      if (existsSync(file)) unlinkSync(file);
    }
    log.info(`[MainContentIndexDB] reset database done: mainDb=${mainDbName}`);
  }
}

export default new MainContentIndexDBManager();
