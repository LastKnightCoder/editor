/**
 * Vibe Learning 项目索引数据库管理器
 *
 * 每个 Vibe Learning 项目有独立的索引数据库
 * 命名规则：{mainDbName}-project-{projectId}.db
 * 例如：work-project-123.db
 */

import { ipcMain, BrowserWindow } from "electron";
import Database from "better-sqlite3";
import { join } from "node:path";
import { existsSync, unlinkSync, readFileSync } from "node:fs";
import log from "electron-log";
import PathUtil from "../utils/PathUtil";
import { loadSqliteVecExtension } from "../utils/sqlite-vec-loader";
import { Module } from "../types/module";

class VibeLearningDBManager implements Module {
  name: string;
  private databases: Map<string, Database.Database> = new Map();
  private currentVecDimensions = 3072; // 默认维度，会在初始化时从配置读取

  constructor() {
    this.name = "vibe-learning-db";
  }

  async init() {
    // 从配置文件读取 embedding 维度
    this.loadDimensionsFromConfig();

    // 注册 IPC 处理器
    ipcMain.handle(
      "vl-get-index-db",
      async (_event, mainDbName: string, projectId: number) => {
        // 不返回数据库对象，只确保连接
        this.getDatabase(mainDbName, projectId);
        return true;
      },
    );

    ipcMain.handle(
      "vl-close-index-db",
      async (_event, mainDbName: string, projectId: number) => {
        this.closeDatabase(mainDbName, projectId);
        return true;
      },
    );

    ipcMain.handle(
      "vl-delete-index-db",
      async (_event, mainDbName: string, projectId: number) => {
        this.deleteDatabase(mainDbName, projectId);
        return true;
      },
    );

    ipcMain.handle(
      "vl-check-index-exists",
      async (
        _event,
        mainDbName: string,
        projectId: number,
        resourceId: number,
      ) => {
        return this.checkIndexExists(mainDbName, projectId, resourceId);
      },
    );

    log.info("[VibeLearningDBManager] Module initialized");
  }

  /**
   * 获取数据库键名
   */
  private getDatabaseKey(mainDbName: string, projectId: number): string {
    const dbNameWithoutExt = mainDbName.replace(/\.db$/, "");
    return `${dbNameWithoutExt}-project-${projectId}`;
  }

  /**
   * 获取数据库文件路径
   */
  private getDatabasePath(mainDbName: string, projectId: number): string {
    const appDir = PathUtil.getAppDir();
    const key = this.getDatabaseKey(mainDbName, projectId);
    return join(appDir, `${key}.db`);
  }

  /**
   * 获取项目索引数据库（自动创建）
   */
  getDatabase(mainDbName: string, projectId: number): Database.Database {
    const key = this.getDatabaseKey(mainDbName, projectId);

    const existing = this.databases.get(key);
    if (existing) {
      return existing;
    }

    const dbPath = this.getDatabasePath(mainDbName, projectId);
    log.info(`[VibeLearningDBManager] Opening database: ${dbPath}`);

    const db = new Database(dbPath);
    loadSqliteVecExtension(db);

    // 设置 WAL 模式
    db.pragma("journal_mode = WAL");

    // 初始化表结构
    this.initTables(db);

    this.databases.set(key, db);
    return db;
  }

  /**
   * 初始化表结构（FTS 和 Vec）
   */
  private initTables(db: Database.Database, dimensions?: number) {
    // FTS 全文搜索表
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vl_content_fts USING fts5(
        resource_id,
        chunk_index,
        content,
        tokenize='porter unicode61'
      )
    `);

    // 获取 vec_version 来确认 sqlite-vec 已加载
    const { vec_version } = db
      .prepare("SELECT vec_version() as vec_version")
      .get() as { vec_version: string };
    log.info(`[VibeLearningDBManager] sqlite-vec version: ${vec_version}`);

    // 初始化向量表
    this.initVecTable(db, dimensions);

    log.info("[VibeLearningDBManager] Tables initialized");
  }

  /**
   * 初始化向量索引表（支持动态维度）
   */
  private initVecTable(db: Database.Database, dimensions?: number) {
    const vecDimensions = dimensions || this.currentVecDimensions;

    // 检查表是否已存在
    const tableExists = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='vl_vec_documents'",
      )
      .get();

    if (!tableExists) {
      db.exec(`
        CREATE VIRTUAL TABLE vl_vec_documents USING vec0(
          resource_id INTEGER,
          chunk_index INTEGER,
          content TEXT,
          vec_embedding FLOAT[${vecDimensions}] distance_metric=cosine
        )
      `);
      log.info(
        `[VibeLearningDBManager] Created vec table with ${vecDimensions} dimensions`,
      );
    }
  }

  /**
   * 重建向量索引表（维度变化时调用）
   */
  reinitVecTable(
    mainDbName: string,
    projectId: number,
    dimensions: number,
  ): boolean {
    try {
      const db = this.getDatabase(mainDbName, projectId);

      // 删除旧表
      db.exec("DROP TABLE IF EXISTS vl_vec_documents");

      // 创建新表
      db.exec(`
        CREATE VIRTUAL TABLE vl_vec_documents USING vec0(
          resource_id INTEGER,
          chunk_index INTEGER,
          content TEXT,
          vec_embedding FLOAT[${dimensions}] distance_metric=cosine
        )
      `);

      log.info(
        `[VibeLearningDBManager] Reinit vec table for project ${projectId} with ${dimensions} dimensions`,
      );
      return true;
    } catch (error) {
      log.error(`[VibeLearningDBManager] Error reinit vec table: ${error}`);
      return false;
    }
  }

  /**
   * 更新当前向量维度配置
   */
  setVecDimensions(dimensions: number): void {
    this.currentVecDimensions = dimensions;
    log.info(`[VibeLearningDBManager] Set vec dimensions to ${dimensions}`);
  }

  /**
   * 从配置文件读取 embedding 维度
   */
  private loadDimensionsFromConfig(): void {
    try {
      const settingPath = join(PathUtil.getAppDir(), "setting.json");
      if (!existsSync(settingPath)) {
        log.info(
          "[VibeLearningDBManager] No setting.json found, using default dimensions",
        );
        return;
      }

      const settingContent = readFileSync(settingPath, "utf-8");
      const setting = JSON.parse(settingContent);

      const { embeddingProvider } = setting;
      if (!embeddingProvider || !embeddingProvider.currentConfigId) {
        return;
      }

      const { configs, currentConfigId } = embeddingProvider;
      const currentConfig = configs?.find(
        (c: { id: string }) => c.id === currentConfigId,
      );

      if (!currentConfig) {
        return;
      }

      const { currentModel, models } = currentConfig;
      const modelConfig = models?.find(
        (m: { name: string }) => m.name === currentModel,
      );

      if (modelConfig?.contextLength) {
        this.currentVecDimensions = modelConfig.contextLength;
        log.info(
          `[VibeLearningDBManager] Loaded dimensions from config: ${this.currentVecDimensions}`,
        );
      }
    } catch (error) {
      log.error(
        `[VibeLearningDBManager] Error loading dimensions from config: ${error}`,
      );
    }
  }

  /**
   * 获取当前向量维度
   */
  getVecDimensions(): number {
    return this.currentVecDimensions;
  }

  /**
   * 关闭项目索引数据库
   */
  closeDatabase(mainDbName: string, projectId: number): void {
    const key = this.getDatabaseKey(mainDbName, projectId);

    const db = this.databases.get(key);
    if (db) {
      try {
        db.close();
        log.info(`[VibeLearningDBManager] Closed database: ${key}`);
      } catch (error) {
        log.error(`[VibeLearningDBManager] Error closing database: ${error}`);
      }
      this.databases.delete(key);
    }
  }

  /**
   * 关闭某主数据库下所有项目索引数据库
   */
  closeAllForMainDB(mainDbName: string): void {
    const prefix = mainDbName.replace(/\.db$/, "") + "-project-";

    for (const [key, db] of this.databases.entries()) {
      if (key.startsWith(prefix)) {
        try {
          db.close();
          log.info(`[VibeLearningDBManager] Closed database: ${key}`);
        } catch (error) {
          log.error(`[VibeLearningDBManager] Error closing database: ${error}`);
        }
        this.databases.delete(key);
      }
    }
  }

  /**
   * 删除项目索引数据库（项目删除时调用）
   */
  deleteDatabase(mainDbName: string, projectId: number): void {
    // 先关闭连接
    this.closeDatabase(mainDbName, projectId);

    const dbPath = this.getDatabasePath(mainDbName, projectId);

    // 删除数据库文件
    try {
      if (existsSync(dbPath)) {
        unlinkSync(dbPath);
        log.info(`[VibeLearningDBManager] Deleted database file: ${dbPath}`);
      }
      // 删除 WAL 和 SHM 文件
      if (existsSync(dbPath + "-wal")) {
        unlinkSync(dbPath + "-wal");
      }
      if (existsSync(dbPath + "-shm")) {
        unlinkSync(dbPath + "-shm");
      }
    } catch (error) {
      log.error(`[VibeLearningDBManager] Error deleting database: ${error}`);
    }
  }

  /**
   * 检查资源 FTS 索引是否存在
   */
  checkIndexExists(
    mainDbName: string,
    projectId: number,
    resourceId: number,
  ): boolean {
    try {
      const db = this.getDatabase(mainDbName, projectId);

      // 检查 FTS 表中是否有记录
      const ftsStmt = db.prepare(
        "SELECT COUNT(*) as count FROM vl_content_fts WHERE resource_id = ?",
      );
      const ftsResult = ftsStmt.get(String(resourceId)) as { count: number };

      return ftsResult.count > 0;
    } catch (error) {
      log.error(`[VibeLearningDBManager] Error checking index: ${error}`);
      return false;
    }
  }

  /**
   * 检查资源向量索引是否存在
   */
  checkVecIndexExists(
    mainDbName: string,
    projectId: number,
    resourceId: number,
  ): boolean {
    try {
      const db = this.getDatabase(mainDbName, projectId);

      // 检查向量表是否存在
      const tableExists = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='vl_vec_documents'",
        )
        .get();

      if (!tableExists) {
        return false;
      }

      // 检查 Vec 表中是否有记录
      // 使用 BigInt 确保 sqlite-vec 接收到真正的整数类型
      const vecStmt = db.prepare(
        "SELECT COUNT(*) as count FROM vl_vec_documents WHERE resource_id = ?",
      );
      const vecResult = vecStmt.get(BigInt(Math.floor(resourceId))) as {
        count: number;
      };

      return vecResult.count > 0;
    } catch (error) {
      log.error(`[VibeLearningDBManager] Error checking vec index: ${error}`);
      return false;
    }
  }

  /**
   * 仅添加向量索引（不影响 FTS 索引）
   */
  addEmbeddingsOnly(
    mainDbName: string,
    projectId: number,
    resourceId: number,
    chunks: Array<{ text: string; embedding: number[] }>,
  ): boolean {
    try {
      const db = this.getDatabase(mainDbName, projectId);

      // 确保 resourceId 是整数（避免 FLOAT 类型错误）
      const intResourceId = Math.floor(resourceId);
      // 使用 BigInt 确保 sqlite-vec 接收到真正的整数类型
      const bigIntResourceId = BigInt(intResourceId);

      // 先删除旧的向量索引
      db.prepare("DELETE FROM vl_vec_documents WHERE resource_id = ?").run(
        bigIntResourceId,
      );

      // 插入新的向量索引
      const vecStmt = db.prepare(`
        INSERT INTO vl_vec_documents (resource_id, chunk_index, content, vec_embedding)
        VALUES (?, ?, ?, vec_f32(?))
      `);

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (chunk.embedding && chunk.embedding.length > 0) {
          vecStmt.run(
            bigIntResourceId,
            BigInt(i),
            chunk.text,
            JSON.stringify(chunk.embedding),
          );
        }
      }

      log.info(
        `[VibeLearningDBManager] Added embeddings for resource ${intResourceId}: ${chunks.length} chunks`,
      );
      return true;
    } catch (error) {
      log.error(`[VibeLearningDBManager] Error adding embeddings: ${error}`);
      return false;
    }
  }

  /**
   * 为资源创建索引
   * 使用事务确保原子性：先删除旧索引再插入新索引，如果失败则回滚保持旧索引不变
   */
  createIndex(
    mainDbName: string,
    projectId: number,
    resourceId: number,
    _content: string,
    chunks: Array<{ text: string; embedding?: number[] }>,
    chunkIndexOffset?: number,
  ): boolean {
    try {
      const db = this.getDatabase(mainDbName, projectId);

      // 先验证数据有效性
      if (!chunks || chunks.length === 0) {
        log.error(
          `[VibeLearningDBManager] createIndex: chunks is empty for resource ${resourceId}`,
        );
        return false;
      }

      const bigIntResourceId = BigInt(resourceId);
      const offset = chunkIndexOffset || 0;

      // 使用事务确保原子性：删除旧索引和插入新索引要么全部成功，要么全部失败
      const transaction = db.transaction(() => {
        // 只在 offset=0 时删除旧索引（首次调用或非分章文档）
        if (offset === 0) {
          // 1. 删除旧 FTS 索引
          db.prepare("DELETE FROM vl_content_fts WHERE resource_id = ?").run(
            String(resourceId),
          );

          // 2. 删除旧向量索引
          db.prepare("DELETE FROM vl_vec_documents WHERE resource_id = ?").run(
            bigIntResourceId,
          );
        }

        // 3. 准备插入语句
        const ftsStmt = db.prepare(`
          INSERT INTO vl_content_fts (resource_id, chunk_index, content)
          VALUES (?, ?, ?)
        `);

        const vecStmt = db.prepare(`
          INSERT INTO vl_vec_documents (resource_id, chunk_index, content, vec_embedding)
          VALUES (?, ?, ?, vec_f32(?))
        `);

        // 4. 插入新索引
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const chunkIndex = offset + i;
          ftsStmt.run(String(resourceId), chunkIndex, chunk.text);

          if (chunk.embedding && chunk.embedding.length > 0) {
            vecStmt.run(
              bigIntResourceId,
              BigInt(chunkIndex),
              chunk.text,
              JSON.stringify(chunk.embedding),
            );
          }
        }
      });

      // 执行事务
      transaction();

      log.info(
        `[VibeLearningDBManager] Created index for resource ${resourceId}: ${chunks.length} chunks`,
      );
      return true;
    } catch (error) {
      // 事务失败自动回滚，旧索引保持不变
      log.error(`[VibeLearningDBManager] Error creating index: ${error}`);
      return false;
    }
  }

  /**
   * 删除资源索引
   */
  removeIndex(
    mainDbName: string,
    projectId: number,
    resourceId: number,
  ): boolean {
    try {
      const db = this.getDatabase(mainDbName, projectId);

      // 确保 resourceId 是整数
      const intResourceId = Math.floor(resourceId);
      // 使用 BigInt 确保 sqlite-vec 接收到真正的整数类型
      const bigIntResourceId = BigInt(intResourceId);

      db.prepare("DELETE FROM vl_content_fts WHERE resource_id = ?").run(
        String(intResourceId),
      );
      db.prepare("DELETE FROM vl_vec_documents WHERE resource_id = ?").run(
        bigIntResourceId,
      );

      log.info(
        `[VibeLearningDBManager] Removed index for resource ${intResourceId}`,
      );
      return true;
    } catch (error) {
      log.error(`[VibeLearningDBManager] Error removing index: ${error}`);
      return false;
    }
  }

  /**
   * 全文搜索
   */
  searchFTS(
    mainDbName: string,
    projectId: number,
    query: string,
    limit = 10,
  ): Array<{
    resourceId: number;
    chunkIndex: number;
    content: string;
    rank?: number;
  }> {
    try {
      const db = this.getDatabase(mainDbName, projectId);

      const stmt = db.prepare(`
        SELECT resource_id, chunk_index, content, rank
        FROM vl_content_fts
        WHERE vl_content_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `);

      const results = stmt.all(query, limit) as Array<{
        resource_id: string;
        chunk_index: number;
        content: string;
        rank?: number;
      }>;

      return results.map((r) => ({
        resourceId: parseInt(r.resource_id, 10),
        chunkIndex: r.chunk_index,
        content: r.content,
        rank: r.rank,
      }));
    } catch (error) {
      log.error(`[VibeLearningDBManager] Error in FTS search: ${error}`);
      return [];
    }
  }

  /**
   * 向量搜索
   */
  searchVec(
    mainDbName: string,
    projectId: number,
    queryEmbedding: number[],
    limit = 10,
    maxDistance = 0.6,
  ): Array<{
    resourceId: number;
    chunkIndex: number;
    content: string;
    distance: number;
  }> {
    try {
      const db = this.getDatabase(mainDbName, projectId);

      const stmt = db.prepare(`
        SELECT resource_id, chunk_index, content, distance
        FROM vl_vec_documents
        WHERE distance < ? AND vec_embedding MATCH ? AND k = ?
        ORDER BY distance
      `);

      // 使用 BigInt 确保 sqlite-vec 接收到真正的整数类型
      const results = stmt.all(
        maxDistance,
        JSON.stringify(queryEmbedding),
        BigInt(limit),
      ) as Array<{
        resource_id: number;
        chunk_index: number;
        content: string;
        distance: number;
      }>;

      return results.map((r) => ({
        resourceId: r.resource_id,
        chunkIndex: r.chunk_index,
        content: r.content,
        distance: r.distance,
      }));
    } catch (error) {
      log.error(`[VibeLearningDBManager] Error in Vec search: ${error}`);
      return [];
    }
  }

  /**
   * 通知所有窗口数据库状态变更
   */
  notifyStatusChange(resourceId: number, status: string, error?: string): void {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send("vibe-learning-status-change", {
          resourceId,
          status,
          error,
        });
      }
    });
  }
}

const vibeLearningDBManager = new VibeLearningDBManager();
export default vibeLearningDBManager;
