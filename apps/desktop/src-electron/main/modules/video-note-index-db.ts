import { ipcMain } from "electron";
import Database from "better-sqlite3";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import log from "electron-log";
import PathUtil from "../utils/PathUtil";
import { loadSqliteVecExtension } from "../utils/sqlite-vec-loader";
import { Module } from "../types/module";
import { ensureIndexDbDir, getIndexDbDir, normalizeMainDbBase } from "./utils/index-db-storage";
import { resolveEmbeddingConfig } from "../utils/embedding-config";

interface VideoNoteIndexChunk {
  chunkIndex: number;
  startMs: number;
  endMs: number;
  text: string;
  embedding?: number[];
}

class VideoNoteIndexDBManager implements Module {
  name: string;
  private databases: Map<string, Database.Database> = new Map();
  private currentVecDimensions = 3072;

  constructor() {
    this.name = "video-note-index-db";
  }

  async init() {
    this.loadDimensionsFromConfig();

    ipcMain.handle(
      "video-note-index-db:get",
      async (_event, mainDbName: string, videoNoteId: number) => {
        this.getDatabase(mainDbName, videoNoteId);
        return true;
      }
    );

    ipcMain.handle(
      "video-note-index-db:delete",
      async (_event, mainDbName: string, videoNoteId: number) => {
        this.deleteDatabase(mainDbName, videoNoteId);
        return true;
      }
    );
  }

  private getDatabaseKey(mainDbName: string, videoNoteId: number): string {
    const dbNameWithoutExt = normalizeMainDbBase(mainDbName);
    return `${dbNameWithoutExt}-video-note-${videoNoteId}`;
  }

  private getDatabasePath(mainDbName: string, videoNoteId: number): string {
    const indexDir = getIndexDbDir(mainDbName);
    return join(indexDir, `${this.getDatabaseKey(mainDbName, videoNoteId)}.db`);
  }

  getDatabase(mainDbName: string, videoNoteId: number): Database.Database {
    ensureIndexDbDir(mainDbName);

    const key = this.getDatabaseKey(mainDbName, videoNoteId);
    const existing = this.databases.get(key);
    if (existing) {
      return existing;
    }

    const dbPath = this.getDatabasePath(mainDbName, videoNoteId);
    const db = new Database(dbPath);
    loadSqliteVecExtension(db);
    db.pragma("journal_mode = WAL");
    this.initTables(db);
    this.databases.set(key, db);
    return db;
  }

  private initTables(db: Database.Database, dimensions?: number) {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS video_note_fts USING fts5(
        chunk_index,
        start_ms,
        end_ms,
        content,
        tokenize='porter unicode61'
      )
    `);

    this.initVecTable(db, dimensions);
  }

  private initVecTable(db: Database.Database, dimensions?: number) {
    const vecDimensions = dimensions || this.currentVecDimensions;
    const tableExists = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='video_note_vec_documents'"
      )
      .get();
    if (!tableExists) {
      db.exec(`
        CREATE VIRTUAL TABLE video_note_vec_documents USING vec0(
          chunk_index INTEGER,
          start_ms INTEGER,
          end_ms INTEGER,
          content TEXT,
          vec_embedding FLOAT[${vecDimensions}] distance_metric=cosine
        )
      `);
    }
  }

  reinitVecTable(mainDbName: string, videoNoteId: number, dimensions: number): boolean {
    try {
      const db = this.getDatabase(mainDbName, videoNoteId);
      db.exec("DROP TABLE IF EXISTS video_note_vec_documents");
      db.exec(`
        CREATE VIRTUAL TABLE video_note_vec_documents USING vec0(
          chunk_index INTEGER,
          start_ms INTEGER,
          end_ms INTEGER,
          content TEXT,
          vec_embedding FLOAT[${dimensions}] distance_metric=cosine
        )
      `);
      return true;
    } catch (error) {
      log.error(`[VideoNoteIndexDB] reinit vec table failed: ${error}`);
      return false;
    }
  }

  setVecDimensions(dimensions: number): void {
    this.currentVecDimensions = dimensions;
  }

  private loadDimensionsFromConfig(): void {
    try {
      const settingPath = join(PathUtil.getAppDir(), "setting.json");
      if (!existsSync(settingPath)) {
        return;
      }
      const settingContent = readFileSync(settingPath, "utf-8");
      const setting = JSON.parse(settingContent);
      const dimensions = resolveEmbeddingConfig(setting)?.dimensions;
      if (dimensions && dimensions > 0) {
        this.currentVecDimensions = dimensions;
      }
    } catch (error) {
      log.error(`[VideoNoteIndexDB] load dimensions failed: ${error}`);
    }
  }

  closeDatabase(mainDbName: string, videoNoteId: number): void {
    const key = this.getDatabaseKey(mainDbName, videoNoteId);
    const db = this.databases.get(key);
    if (!db) {
      return;
    }
    try {
      db.close();
    } catch (error) {
      log.error(`[VideoNoteIndexDB] close failed: ${error}`);
    }
    this.databases.delete(key);
  }

  closeAllForMainDB(mainDbName: string): void {
    const prefix = `${mainDbName.replace(/\.db$/, "")}-video-note-`;
    for (const [key, db] of this.databases.entries()) {
      if (!key.startsWith(prefix)) {
        continue;
      }
      try {
        db.close();
      } catch (error) {
        log.error(`[VideoNoteIndexDB] close failed: ${error}`);
      }
      this.databases.delete(key);
    }
  }

  deleteDatabase(mainDbName: string, videoNoteId: number): void {
    this.closeDatabase(mainDbName, videoNoteId);
    const paths = [this.getDatabasePath(mainDbName, videoNoteId)];
    for (const dbPath of paths) {
      try {
        if (existsSync(dbPath)) {
          unlinkSync(dbPath);
        }
        if (existsSync(`${dbPath}-wal`)) {
          unlinkSync(`${dbPath}-wal`);
        }
        if (existsSync(`${dbPath}-shm`)) {
          unlinkSync(`${dbPath}-shm`);
        }
      } catch (error) {
        log.error(`[VideoNoteIndexDB] delete db failed: path=${dbPath}, ${error}`);
      }
    }
  }

  checkIndexExists(mainDbName: string, videoNoteId: number): boolean {
    try {
      const db = this.getDatabase(mainDbName, videoNoteId);
      const row = db.prepare("SELECT COUNT(*) as count FROM video_note_fts").get() as {
        count: number;
      };
      return row.count > 0;
    } catch (error) {
      log.error(`[VideoNoteIndexDB] check index failed: ${error}`);
      return false;
    }
  }

  createIndex(mainDbName: string, videoNoteId: number, chunks: VideoNoteIndexChunk[]): boolean {
    try {
      const db = this.getDatabase(mainDbName, videoNoteId);
      if (!chunks.length) {
        this.removeIndex(mainDbName, videoNoteId);
        return true;
      }

      const transaction = db.transaction(() => {
        db.prepare("DELETE FROM video_note_fts").run();
        db.prepare("DELETE FROM video_note_vec_documents").run();

        const ftsStmt = db.prepare(`
          INSERT INTO video_note_fts (chunk_index, start_ms, end_ms, content)
          VALUES (?, ?, ?, ?)
        `);
        const vecStmt = db.prepare(`
          INSERT INTO video_note_vec_documents (chunk_index, start_ms, end_ms, content, vec_embedding)
          VALUES (?, ?, ?, ?, vec_f32(?))
        `);

        for (const chunk of chunks) {
          ftsStmt.run(chunk.chunkIndex, chunk.startMs, chunk.endMs, chunk.text);
          if (chunk.embedding && chunk.embedding.length > 0) {
            vecStmt.run(
              BigInt(chunk.chunkIndex),
              BigInt(Math.floor(chunk.startMs)),
              BigInt(Math.floor(chunk.endMs)),
              chunk.text,
              JSON.stringify(chunk.embedding)
            );
          }
        }
      });

      transaction();
      return true;
    } catch (error) {
      log.error(`[VideoNoteIndexDB] create index failed: ${error}`);
      return false;
    }
  }

  addEmbeddingsOnly(
    mainDbName: string,
    videoNoteId: number,
    chunks: VideoNoteIndexChunk[]
  ): boolean {
    try {
      const db = this.getDatabase(mainDbName, videoNoteId);
      db.prepare("DELETE FROM video_note_vec_documents").run();
      const vecStmt = db.prepare(`
        INSERT INTO video_note_vec_documents (chunk_index, start_ms, end_ms, content, vec_embedding)
        VALUES (?, ?, ?, ?, vec_f32(?))
      `);
      for (const chunk of chunks) {
        if (!chunk.embedding || chunk.embedding.length === 0) {
          continue;
        }
        vecStmt.run(
          BigInt(chunk.chunkIndex),
          BigInt(Math.floor(chunk.startMs)),
          BigInt(Math.floor(chunk.endMs)),
          chunk.text,
          JSON.stringify(chunk.embedding)
        );
      }
      return true;
    } catch (error) {
      log.error(`[VideoNoteIndexDB] add embeddings failed: ${error}`);
      return false;
    }
  }

  removeIndex(mainDbName: string, videoNoteId: number): boolean {
    try {
      const db = this.getDatabase(mainDbName, videoNoteId);
      db.prepare("DELETE FROM video_note_fts").run();
      db.prepare("DELETE FROM video_note_vec_documents").run();
      return true;
    } catch (error) {
      log.error(`[VideoNoteIndexDB] remove index failed: ${error}`);
      return false;
    }
  }

  searchFTS(
    mainDbName: string,
    videoNoteId: number,
    query: string,
    limit = 10
  ): Array<{
    chunkIndex: number;
    startMs: number;
    endMs: number;
    content: string;
    rank?: number;
  }> {
    try {
      const db = this.getDatabase(mainDbName, videoNoteId);
      const stmt = db.prepare(`
        SELECT chunk_index, start_ms, end_ms, content, rank
        FROM video_note_fts
        WHERE video_note_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `);
      const rows = stmt.all(query, limit) as Array<{
        chunk_index: number;
        start_ms: number;
        end_ms: number;
        content: string;
        rank?: number;
      }>;
      return rows.map(row => ({
        chunkIndex: row.chunk_index,
        startMs: row.start_ms,
        endMs: row.end_ms,
        content: row.content,
        rank: row.rank,
      }));
    } catch (error) {
      log.error(`[VideoNoteIndexDB] fts search failed: ${error}`);
      return [];
    }
  }

  searchVec(
    mainDbName: string,
    videoNoteId: number,
    queryEmbedding: number[],
    limit = 10,
    maxDistance = 0.6
  ): Array<{
    chunkIndex: number;
    startMs: number;
    endMs: number;
    content: string;
    distance: number;
  }> {
    try {
      const db = this.getDatabase(mainDbName, videoNoteId);
      const tableExists = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='video_note_vec_documents'"
        )
        .get();
      if (!tableExists) {
        return [];
      }

      const stmt = db.prepare(`
        SELECT chunk_index, start_ms, end_ms, content, distance
        FROM video_note_vec_documents
        WHERE distance < ? AND vec_embedding MATCH ? AND k = ?
        ORDER BY distance
      `);
      const rows = stmt.all(maxDistance, JSON.stringify(queryEmbedding), BigInt(limit)) as Array<{
        chunk_index: number;
        start_ms: number;
        end_ms: number;
        content: string;
        distance: number;
      }>;

      return rows.map(row => ({
        chunkIndex: row.chunk_index,
        startMs: row.start_ms,
        endMs: row.end_ms,
        content: row.content,
        distance: row.distance,
      }));
    } catch (error) {
      log.error(`[VideoNoteIndexDB] vec search failed: ${error}`);
      return [];
    }
  }
}

const videoNoteIndexDBManager = new VideoNoteIndexDBManager();
export type { VideoNoteIndexChunk };
export default videoNoteIndexDBManager;
