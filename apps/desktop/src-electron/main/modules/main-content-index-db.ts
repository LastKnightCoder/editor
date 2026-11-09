import Database from "better-sqlite3";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import log from "electron-log";
import PathUtil from "../utils/PathUtil";
import { loadSqliteVecExtension } from "../utils/sqlite-vec-loader";
import INDEX_SCHEMA_SQL from "@tau/db-schema/schema/index.sql?raw";
import INDEX_VEC_TEMPLATE_SQL from "@tau/db-schema/schema/index/20_vec_template.sql?raw";
import { ensureIndexDbDir, getIndexDbDir, normalizeMainDbBase } from "./utils/index-db-storage";
import { compareDownloadedIndex } from "./database-download-index";
import { resolveEmbeddingConfig } from "../utils/embedding-config";
import {
  KNOWLEDGE_MAP_COMPUTED_AT_KEY,
  KNOWLEDGE_MAP_FINGERPRINT_KEY,
} from "./tables/knowledge-map";

export type IndexRebuildState = "pending" | "building" | "ready" | "failed";
export type IndexRebuildTarget = "aggregate" | "fts" | "vec";

export interface EnsureIndexReadyResult {
  rebuildState: IndexRebuildState;
}

const REBUILD_STATE_KEY = "rebuild_state";
const FTS_REBUILD_STATE_KEY = "fts_rebuild_state";
const VEC_REBUILD_STATE_KEY = "vec_rebuild_state";
const UPDATED_AT_KEY = "updated_at";
const DEFAULT_VEC_DIMENSION = 3072;

class MainContentIndexDBManager {
  private databases: Map<string, Database.Database> = new Map();

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

  private getDatabaseKey(mainDbName: string): string {
    return this.normalizeMainDbName(mainDbName);
  }

  private resolveVecDimensionsFromSetting(): number | null {
    const startedAt = Date.now();
    try {
      const settingPath = join(PathUtil.getAppDir(), "setting.json");
      if (!existsSync(settingPath)) {
        log.info(
          `[MainContentIndexDB] resolveVecDimensions unavailable: reason=setting_missing, elapsedMs=${Date.now() - startedAt}`
        );
        return null;
      }
      const raw = readFileSync(settingPath, "utf8");
      if (!raw.trim()) {
        log.info(
          `[MainContentIndexDB] resolveVecDimensions unavailable: reason=setting_empty, elapsedMs=${Date.now() - startedAt}`
        );
        return null;
      }
      const setting = JSON.parse(raw) as Record<string, unknown>;
      const dimensions = resolveEmbeddingConfig(setting)?.dimensions;
      if (!dimensions || dimensions <= 0) {
        log.info(
          `[MainContentIndexDB] resolveVecDimensions unavailable: reason=config_missing, elapsedMs=${Date.now() - startedAt}`
        );
        return null;
      }
      log.info(
        `[MainContentIndexDB] resolveVecDimensions success: dimensions=${dimensions}, elapsedMs=${Date.now() - startedAt}`
      );
      return dimensions;
    } catch (error) {
      log.warn("[MainContentIndexDB] resolveVecDimensionsFromSetting failed, unavailable:", error);
      return null;
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

  private ensureVecTableByDimensions(
    indexDb: Database.Database,
    vecDimensions: number | null
  ): boolean {
    const current = this.getCurrentVecDimensions(indexDb);
    const target = vecDimensions ?? current ?? DEFAULT_VEC_DIMENSION;

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

  /** 可再生的派生表结构不符时丢弃重建（如旧版知识地图表以 card_id 为主键，CREATE IF NOT EXISTS 改不了它） */
  private dropLegacyKnowledgeMapTables(indexDb: Database.Database) {
    const table = indexDb
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'knowledge_map_nodes'")
      .get();
    if (!table) return;
    const columns = indexDb.pragma("table_info(knowledge_map_nodes)") as Array<{ name: string }>;
    if (columns.some(column => column.name === "node_key")) return;
    indexDb.exec("DROP TABLE knowledge_map_nodes; DROP TABLE IF EXISTS knowledge_map_topics;");
    if (indexDb.prepare("SELECT 1 FROM sqlite_master WHERE name = 'index_meta'").get()) {
      indexDb
        .prepare("DELETE FROM index_meta WHERE key IN (?, ?)")
        .run(KNOWLEDGE_MAP_FINGERPRINT_KEY, KNOWLEDGE_MAP_COMPUTED_AT_KEY);
    }
  }

  private initSchema(indexDb: Database.Database) {
    const startedAt = Date.now();
    const schemaStartAt = Date.now();
    this.dropLegacyKnowledgeMapTables(indexDb);
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

    if (!this.getMeta(indexDb, REBUILD_STATE_KEY)) {
      this.setMeta(indexDb, REBUILD_STATE_KEY, "pending");
    }
    this.ensureScopedRebuildStates(indexDb);
    if (this.getMeta(indexDb, "diary_entity_version") !== "moment-1") {
      indexDb.transaction(() => {
        indexDb.prepare("DELETE FROM content_fts WHERE type = 'diary-daily'").run();
        indexDb.prepare("DELETE FROM vec_documents WHERE type = 'diary-daily'").run();
        indexDb
          .prepare("DELETE FROM content_sections WHERE prefixed_id LIKE 'diary-daily:%'")
          .run();
        this.writeRebuildState(indexDb, "pending", "fts");
        this.writeRebuildState(indexDb, "pending", "vec");
        this.setMeta(indexDb, "diary_entity_version", "moment-1");
      })();
    }
    if (vecRecreated) {
      this.writeRebuildState(indexDb, "pending", "vec");
    }
    log.info(
      `[MainContentIndexDB] initSchema done: vecDimensions=${vecDimensions}, vecRecreated=${vecRecreated}, totalElapsedMs=${Date.now() - startedAt}`
    );
  }

  private getMeta(db: Database.Database, key: string): string | null {
    const row = db.prepare("SELECT value FROM index_meta WHERE key = ?").get(key) as
      | { value?: string }
      | undefined;
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

  getDatabase(mainDbName: string): Database.Database {
    const startedAt = Date.now();
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

  ensureReady(mainDbName: string): EnsureIndexReadyResult {
    const startAt = Date.now();
    const indexDb = this.getDatabase(mainDbName);
    const vecDimensions = this.resolveVecDimensionsFromSetting();
    const vecRecreated = this.ensureVecTableByDimensions(indexDb, vecDimensions);
    if (vecRecreated) {
      this.writeRebuildState(indexDb, "pending", "vec");
    }
    const nextRebuildState = this.getRebuildState(mainDbName);
    log.info(
      `[MainContentIndexDB] ensureReady done: mainDb=${mainDbName}, rebuildState=${nextRebuildState}, vecDimensions=${vecDimensions}, vecRecreated=${vecRecreated}, elapsedMs=${Date.now() - startAt}`
    );
    return {
      rebuildState: nextRebuildState,
    };
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

  prepareDownload(
    mainDbName: string,
    databasePath: string,
    downloadPath: string,
    reusedFiles?: readonly string[]
  ) {
    if (!existsSync(this.getDatabasePath(mainDbName))) return;
    const indexDb = this.getDatabase(mainDbName);
    try {
      const startedAt = performance.now();
      const { indexed, differences } = compareDownloadedIndex(
        indexDb,
        databasePath,
        downloadPath,
        reusedFiles
      );
      const compareMs = Math.round(performance.now() - startedAt);
      indexDb.transaction(() => {
        if (differences.length) {
          indexDb.exec(
            "CREATE TEMP TABLE download_index_changes (key TEXT PRIMARY KEY, revision REAL)"
          );
          const addChange = indexDb.prepare("INSERT INTO download_index_changes VALUES (?, ?)");
          for (const { key, revision } of differences) addChange.run(key, revision);
          // sqlite-vec 按实体键逐条删除或更新会反复扫描向量表。
          const rows = indexDb
            .prepare<[], { rowid: number; revision: number | null }>(`
            SELECT v.rowid, c.revision
            FROM vec_documents v CROSS JOIN download_index_changes c ON c.key = v.prefixed_id
          `)
            .all();
          const remove = indexDb.prepare("DELETE FROM vec_documents WHERE rowid = ?");
          const retag = indexDb.prepare(
            "UPDATE vec_documents SET update_time = CAST(? AS REAL) WHERE rowid = ?"
          );
          for (const { rowid, revision } of rows) {
            if (revision === null) remove.run(rowid);
            else retag.run(revision, rowid);
          }
          indexDb.exec("DROP TABLE download_index_changes");

          const removeSections = indexDb.prepare(
            "DELETE FROM content_sections WHERE prefixed_id = ?"
          );
          const retagSections = indexDb.prepare(
            "UPDATE OR REPLACE content_sections SET update_time = ? WHERE prefixed_id = ? AND update_time = ?"
          );
          for (const { key, revision, oldRevision } of differences) {
            if (revision === null) removeSections.run(key);
            else retagSections.run(revision, key, oldRevision);
          }
        }
        // 其他派生表按自己的重建协议恢复，避免旧库的实体身份泄漏到新库。
        indexDb.exec(`
          DELETE FROM content_fts;
          DELETE FROM content_sections WHERE rowid IN (
            SELECT s.rowid FROM content_sections s
            LEFT JOIN (SELECT DISTINCT prefixed_id, update_time FROM vec_documents) v
              ON v.prefixed_id = s.prefixed_id AND v.update_time = s.update_time
            WHERE v.prefixed_id IS NULL
          );
          DELETE FROM entity_refs;
          DELETE FROM entity_ref_sources;
          DELETE FROM whiteboard_refs;
          DELETE FROM whiteboard_ref_sources;
          DELETE FROM whiteboard_embeds;
          DELETE FROM doc_tasks;
          DELETE FROM doc_task_sources;
          DELETE FROM doc_task_attributes;
          DELETE FROM knowledge_map_nodes;
          DELETE FROM knowledge_map_topics;
          DELETE FROM index_meta WHERE key <> 'diary_entity_version';
        `);
        this.writeRebuildState(indexDb, "pending", "fts");
        this.writeRebuildState(indexDb, "pending", "vec");
      })();
      log.info(
        `[MainContentIndexDB] Download index compared: db=${mainDbName}, indexed=${indexed}, invalidated=${differences.filter(item => item.revision === null).length}, retagged=${differences.filter(item => item.revision !== null).length}, compareMs=${compareMs}, elapsedMs=${Math.round(performance.now() - startedAt)}`
      );
    } finally {
      this.closeDatabase(mainDbName);
    }
  }
}

export default new MainContentIndexDBManager();
