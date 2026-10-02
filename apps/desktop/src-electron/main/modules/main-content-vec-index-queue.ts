import log from "electron-log";
import type Database from "better-sqlite3";
import { Module } from "../types/module";
import databaseModule from "./database";
import CardTable from "./tables/card";
import ArticleTable from "./tables/article";
import ProjectTable from "./tables/project";
import DiaryTable from "./tables/diary";
import VecDocumentTable from "./tables/vec-document";
import { listMaterialIndexDocs, MATERIAL_INDEX_TYPES } from "./material-index";
import { getMarkdown } from "@/utils/markdown.ts";
import { splitSections, type ContentSection } from "@/entity/sections";
import { MAIN_CHUNK_BUILD_KEY, mainEmbeddingFingerprint } from "@/entity/chunk-version";
import type { IndexType } from "@/types";
import type { ResolvedEmbeddingConfig } from "../utils/embedding-config";
import { yieldEvery, yieldToEventLoop } from "../utils/event-loop-yield";

export type MainContentReconcileReason =
  | "config_switch"
  | "model_switch"
  | "db_switch"
  | "startup_reconcile"
  | "sync_upload_reconnect"
  | "sync_download_reconnect";

/** 主内容队列的运行原因：自动 reconcile 之外还有用户手动发起 */
export type MainContentIndexRunReason = MainContentReconcileReason | "manual" | "content_idle";

/** 参与向量索引的主内容类型（与 collect 顺序一致）：正文实体 + 外部材料（KL-037） */
export const MAIN_CONTENT_INDEX_TYPES = [
  "card",
  "article",
  "project-item",
  "diary-daily",
  ...MATERIAL_INDEX_TYPES,
] as const;
export type MainContentIndexType = (typeof MAIN_CONTENT_INDEX_TYPES)[number];

export interface MainContentVecIndexProgress {
  mainDbName: string;
  reason: MainContentIndexRunReason;
  phase: "collecting" | "indexing" | "done" | "failed" | "aborted";
  /** 本轮需要（重新）索引的文档数 */
  queued: number;
  processed: number;
  indexed: number;
  failed: number;
  startedAt: number;
  finishedAt?: number;
  error?: string;
  /** 实时覆盖率：开始时扫库得出基数，之后每处理成功一篇在内存里挪一格，随进度推送 */
  stats?: MainContentIndexStats;
}

export interface MainContentIndexCounts {
  /** 有正文、应被索引的文档数 */
  total: number;
  /** 已索引且与当前内容一致 */
  indexed: number;
  /** 已索引但内容在索引之后又有更新 */
  outdated: number;
  /** 从未索引 */
  unindexed: number;
}

export interface MainContentIndexStats extends MainContentIndexCounts {
  byType: Record<MainContentIndexType, MainContentIndexCounts>;
}

/** 一篇索引成功：从「未索引」或「待更新」挪到「已索引」（计数不为负） */
export function markIndexed(
  stats: MainContentIndexStats,
  type: string,
  wasIndexedBefore: boolean
): void {
  const from: keyof MainContentIndexCounts = wasIndexedBefore ? "outdated" : "unindexed";
  const bucket = stats.byType[type as MainContentIndexType];
  for (const counts of bucket ? [stats, bucket] : [stats]) {
    if (counts[from] <= 0) continue;
    counts[from] -= 1;
    counts.indexed += 1;
  }
}

const cloneProgress = (progress: MainContentVecIndexProgress): MainContentVecIndexProgress => ({
  ...progress,
  stats: progress.stats && {
    ...progress.stats,
    byType: Object.fromEntries(
      Object.entries(progress.stats.byType).map(([type, counts]) => [type, { ...counts }])
    ) as MainContentIndexStats["byType"],
  },
});

const LAST_RUN_META_KEY = "main_content_last_run";
const PROGRESS_EMIT_INTERVAL_MS = 300;

interface MainContentVecIndexTask {
  id: number;
  type: IndexType;
  updateTime: number;
  content: string;
  title?: string;
  sections?: ContentSection[];
}

interface ReconcileByPolicyParams {
  mainDbName: string;
  embeddingConfig: ResolvedEmbeddingConfig;
  fingerprintChanged: boolean;
  autoIndex: boolean;
  reason: MainContentIndexRunReason;
}

export interface MainContentReconcileResult {
  generation: number;
  reason: MainContentIndexRunReason;
  reinitialized: boolean;
  queued: number;
  indexed: number;
  failed: number;
  stale: boolean;
  autoIndex: boolean;
}

class MainContentVecIndexQueue implements Module {
  name = "main-content-vec-index-queue";
  private generation = 0;
  private runChain: Promise<void> = Promise.resolve();
  private static readonly COLLECT_YIELD_EVERY = 25;
  private currentProgress: MainContentVecIndexProgress | null = null;
  private progressListeners = new Set<(progress: MainContentVecIndexProgress) => void>();
  private lastEmitAt = 0;

  async init() {
    log.info("[MainContentVecIndexQueue] Module initialized");
  }

  /** 当前是否有一轮主内容向量索引在进行 */
  isRunning(): boolean {
    return this.currentProgress !== null;
  }

  getCurrentProgress(): MainContentVecIndexProgress | null {
    return this.currentProgress ? { ...this.currentProgress } : null;
  }

  onProgress(listener: (progress: MainContentVecIndexProgress) => void): () => void {
    this.progressListeners.add(listener);
    return () => {
      this.progressListeners.delete(listener);
    };
  }

  /** 上一轮已结束的索引记录（持久化在索引库，重启后仍可读） */
  getLastRun(indexDb: Database.Database): MainContentVecIndexProgress | null {
    this.ensureMetaTable(indexDb);
    const row = indexDb
      .prepare("SELECT value FROM vec_index_meta WHERE key = ?")
      .get(LAST_RUN_META_KEY) as { value?: string } | undefined;
    if (!row?.value) {
      return null;
    }
    try {
      return JSON.parse(row.value) as MainContentVecIndexProgress;
    } catch {
      return null;
    }
  }

  /**
   * 统计主内容的索引覆盖情况：总数 / 已索引 / 待更新（索引后内容有改动）/ 未索引。
   * 口径与 reconcile 的收集逻辑一致（空正文不计入）。
   */
  async getIndexStats(mainDbName: string): Promise<MainContentIndexStats | null> {
    const ensureResult = await databaseModule.ensureIndexDatabaseReady(mainDbName, "vec:stats");
    const mainDb = databaseModule.getDatabase(mainDbName);
    const indexDb = databaseModule.getIndexDatabase(mainDbName);
    if (!ensureResult || !mainDb || !indexDb) {
      return null;
    }

    return this.computeStats(mainDb, indexDb);
  }

  private async computeStats(
    mainDb: Database.Database,
    indexDb: Database.Database
  ): Promise<MainContentIndexStats> {
    const emptyCounts = (): MainContentIndexCounts => ({
      total: 0,
      indexed: 0,
      outdated: 0,
      unindexed: 0,
    });
    const stats: MainContentIndexStats = {
      ...emptyCounts(),
      byType: Object.fromEntries(
        MAIN_CONTENT_INDEX_TYPES.map(type => [type, emptyCounts()])
      ) as Record<MainContentIndexType, MainContentIndexCounts>,
    };

    const indexedTimes = this.loadIndexedUpdateTimes(indexDb);
    await this.forEachCandidate(mainDb, task => {
      const bucket = stats.byType[task.type as MainContentIndexType];
      const indexedTime = indexedTimes.get(`${task.type}:${task.id}`);
      const key: keyof MainContentIndexCounts =
        indexedTime === undefined
          ? "unindexed"
          : indexedTime < task.updateTime
            ? "outdated"
            : "indexed";
      stats.total += 1;
      stats[key] += 1;
      bucket.total += 1;
      bucket[key] += 1;
    });

    return stats;
  }

  /**
   * 立即使当前正在运行的 reconcile 失效，
   * 用于数据库切换时在 orchestrator 链外部快速中止旧任务
   */
  abortCurrentRun(): void {
    this.generation++;
    log.info(`[MainContentVecIndexQueue] Abort current run, generation=${this.generation}`);
  }

  async reconcileByPolicy(params: ReconcileByPolicyParams): Promise<MainContentReconcileResult> {
    const generation = ++this.generation;
    return this.enqueue(() => this.runReconcile(generation, params));
  }

  private async enqueue<T>(task: () => Promise<T>): Promise<T> {
    const nextTask = this.runChain.then(task, task);
    this.runChain = nextTask.then(
      () => undefined,
      () => undefined
    );
    return nextTask;
  }

  private isStale(generation: number): boolean {
    return generation !== this.generation;
  }

  private async runReconcile(
    generation: number,
    params: ReconcileByPolicyParams
  ): Promise<MainContentReconcileResult> {
    const ensureResult = await databaseModule.ensureIndexDatabaseReady(
      params.mainDbName,
      `vec:${params.reason}`
    );
    if (!ensureResult) {
      log.warn(
        `[MainContentVecIndexQueue] Skip reconcile, index ensure skipped: ${params.mainDbName}`
      );
      return {
        generation,
        reason: params.reason,
        reinitialized: false,
        queued: 0,
        indexed: 0,
        failed: 0,
        stale: true,
        autoIndex: params.autoIndex,
      };
    }

    const mainDb = databaseModule.getDatabase(params.mainDbName);
    const indexDb = databaseModule.getIndexDatabase(params.mainDbName);
    if (!mainDb || !indexDb) {
      log.warn(`[MainContentVecIndexQueue] Database not found: ${params.mainDbName}`);
      return {
        generation,
        reason: params.reason,
        reinitialized: false,
        queued: 0,
        indexed: 0,
        failed: 0,
        stale: true,
        autoIndex: params.autoIndex,
      };
    }

    let reinitialized = false;

    if (params.fingerprintChanged) {
      VecDocumentTable.clearTableData(indexDb);
      if (params.embeddingConfig.dimensions > 0) {
        VecDocumentTable.initTableByVecLength(indexDb, params.embeddingConfig.dimensions);
      }
      reinitialized = true;
      if (params.autoIndex) {
        // 重试沿用已创建的向量表，成功写入的实体不应再次付费嵌入。
        indexDb
          .prepare(
            `INSERT INTO vec_index_meta (key, value, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
          )
          .run(
            MAIN_CHUNK_BUILD_KEY,
            mainEmbeddingFingerprint(params.embeddingConfig.fingerprint),
            Date.now()
          );
      }
    } else if (params.autoIndex) {
      this.ensureVecTableReady(indexDb, params.embeddingConfig.dimensions);
    }

    if (!params.autoIndex) {
      log.info(
        `[MainContentVecIndexQueue] Skip auto indexing: reason=${params.reason}, provider=${params.embeddingConfig.providerType}`
      );
      return {
        generation,
        reason: params.reason,
        reinitialized,
        queued: 0,
        indexed: 0,
        failed: 0,
        stale: false,
        autoIndex: false,
      };
    }

    databaseModule.setIndexRebuildState(params.mainDbName, "building", "vec");
    log.info(
      `[MainContentVecIndexQueue] Vector index switched to building: db=${params.mainDbName}, reason=${params.reason}, generation=${generation}, searchableDuringBuilding=true`
    );

    this.startProgress(params.mainDbName, params.reason);
    const modelInfo = {
      configId: params.embeddingConfig.configId,
      providerType: params.embeddingConfig.providerType,
      key: params.embeddingConfig.apiKey,
      baseUrl: params.embeddingConfig.baseUrl,
      model: params.embeddingConfig.model,
      dimensions: params.embeddingConfig.dimensions,
      batchSize: params.embeddingConfig.batchSize,
      devicePolicy: params.embeddingConfig.devicePolicy,
      localModelDir: params.embeddingConfig.localModelDir,
    };

    try {
      const tasks = await this.collectTasks(mainDb, indexDb, params.fingerprintChanged);
      const stats = await this.computeStats(mainDb, indexDb);
      const previouslyIndexed = this.loadIndexedUpdateTimes(indexDb);
      this.updateProgress({ phase: "indexing", queued: tasks.length, stats }, true);
      let indexed = 0;
      let failed = 0;
      let consecutiveFailures = 0;
      for (const task of tasks) {
        if (this.isStale(generation)) {
          log.info(
            `[MainContentVecIndexQueue] Drop stale task generation=${generation} current=${this.generation}`
          );
          databaseModule.setIndexRebuildState(params.mainDbName, "pending", "vec");
          this.finishProgress(indexDb, { phase: "aborted" });
          return {
            generation,
            reason: params.reason,
            reinitialized,
            queued: tasks.length,
            indexed,
            failed,
            stale: true,
            autoIndex: true,
          };
        }

        const ok = await VecDocumentTable.indexContent(indexDb, {
          id: task.id,
          type: task.type,
          content: task.content,
          title: task.title,
          sections: task.sections,
          updateTime: task.updateTime,
          modelInfo,
        });

        if (ok) {
          indexed += 1;
          consecutiveFailures = 0;
          markIndexed(stats, task.type, previouslyIndexed.has(`${task.type}:${task.id}`));
          this.updateProgress({ processed: indexed + failed, indexed, failed });
        } else {
          failed += 1;
          consecutiveFailures += 1;
          this.updateProgress({ processed: indexed + failed, indexed, failed });
          log.warn(`[MainContentVecIndexQueue] Index failed: type=${task.type}, id=${task.id}`);
          // 开局即连续失败视为全局性错误（模型缺失/配置错误等），
          // 中止本轮以保持 pending 状态且不落 fingerprint，避免
          // “空索引 + 指纹已落库”的静默死锁
          if (indexed === 0 && consecutiveFailures >= 3) {
            throw new Error(
              `向量索引连续失败 ${consecutiveFailures} 次（无任何成功），已中止本轮重建；请检查本地向量模型是否可用`
            );
          }
        }
        await yieldToEventLoop();
      }

      databaseModule.setIndexRebuildState(params.mainDbName, failed ? "pending" : "ready", "vec");
      this.finishProgress(
        indexDb,
        failed
          ? { phase: "failed", error: `${failed} 个实体索引失败，等待补全` }
          : { phase: "done" }
      );
      log.info(
        `[MainContentVecIndexQueue] Reconcile done: reason=${params.reason}, generation=${generation}, queued=${tasks.length}, indexed=${indexed}, reinitialized=${reinitialized}, searchableDuringBuilding=true`
      );
      return {
        generation,
        reason: params.reason,
        reinitialized,
        queued: tasks.length,
        indexed,
        failed,
        stale: false,
        autoIndex: true,
      };
    } catch (error) {
      databaseModule.setIndexRebuildState(params.mainDbName, "failed", "vec");
      this.finishProgress(indexDb, {
        phase: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private startProgress(mainDbName: string, reason: MainContentIndexRunReason) {
    this.currentProgress = {
      mainDbName,
      reason,
      phase: "collecting",
      queued: 0,
      processed: 0,
      indexed: 0,
      failed: 0,
      startedAt: Date.now(),
    };
    this.emitProgress(true);
  }

  private updateProgress(patch: Partial<MainContentVecIndexProgress>, force = false) {
    if (!this.currentProgress) {
      return;
    }
    this.currentProgress = { ...this.currentProgress, ...patch };
    this.emitProgress(force);
  }

  private finishProgress(indexDb: Database.Database, patch: Partial<MainContentVecIndexProgress>) {
    if (!this.currentProgress) {
      return;
    }
    const finished: MainContentVecIndexProgress = {
      ...cloneProgress(this.currentProgress),
      ...patch,
      finishedAt: Date.now(),
    };
    this.currentProgress = null;
    try {
      this.ensureMetaTable(indexDb);
      indexDb
        .prepare(
          `
          INSERT INTO vec_index_meta (key, value, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        `
        )
        .run(LAST_RUN_META_KEY, JSON.stringify(finished), finished.finishedAt);
    } catch (error) {
      log.warn("[MainContentVecIndexQueue] Persist last run failed:", error);
    }
    this.notifyListeners(finished);
  }

  /** 逐条进度按时间节流，阶段切换 / 结束立即推送 */
  private emitProgress(force: boolean) {
    if (!this.currentProgress) {
      return;
    }
    const now = Date.now();
    if (!force && now - this.lastEmitAt < PROGRESS_EMIT_INTERVAL_MS) {
      return;
    }
    this.lastEmitAt = now;
    this.notifyListeners(cloneProgress(this.currentProgress));
  }

  private notifyListeners(progress: MainContentVecIndexProgress) {
    for (const listener of this.progressListeners) {
      try {
        listener(progress);
      } catch (error) {
        log.warn("[MainContentVecIndexQueue] Progress listener failed:", error);
      }
    }
  }

  private ensureMetaTable(db: Database.Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS vec_index_meta (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at INTEGER
      )
    `);
  }

  /** 一次性读出已索引文档的 update_time（每个文档取任一分块，分块共享同一 update_time） */
  private loadIndexedUpdateTimes(indexDb: Database.Database): Map<string, number> {
    const result = new Map<string, number>();
    const tableExists = indexDb
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='vec_documents'")
      .get();
    if (!tableExists) {
      return result;
    }
    const rows = indexDb
      .prepare(
        "SELECT prefixed_id, MAX(update_time) AS update_time FROM vec_documents GROUP BY prefixed_id"
      )
      .all() as Array<{ prefixed_id: string; update_time: number | null }>;
    for (const row of rows) {
      if (row.update_time !== null && row.update_time !== undefined) {
        result.set(row.prefixed_id, Number(row.update_time));
      }
    }
    return result;
  }

  private ensureVecTableReady(db: Database.Database, dimensions: number) {
    const tableExists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='vec_documents'")
      .get();
    if (!tableExists && dimensions > 0) {
      VecDocumentTable.initTableByVecLength(db, dimensions);
    }
  }

  private async collectTasks(
    mainDb: Database.Database,
    indexDb: Database.Database,
    forceReindex: boolean
  ): Promise<MainContentVecIndexTask[]> {
    const tasks: MainContentVecIndexTask[] = [];
    const candidates = new Set<string>();
    await this.forEachCandidate(mainDb, task => {
      candidates.add(`${task.type}:${task.id}`);
      if (forceReindex) {
        tasks.push(task);
        return;
      }
      const indexInfo = VecDocumentTable.checkIndexExists(indexDb, task.id, task.type);
      if (!indexInfo || indexInfo.updateTime < task.updateTime) {
        tasks.push(task);
      }
    });
    // 已不是候选的（实体已删、摘录软删、剪藏变孤儿、正文清空）删掉，检索不再命中
    const removed = VecDocumentTable.removeIndexesNotIn(
      indexDb,
      candidates,
      MAIN_CONTENT_INDEX_TYPES
    );
    if (removed) log.info(`[MainContentVecIndexQueue] Removed stale vectors: ${removed}`);
    return tasks;
  }

  /** 遍历全部有正文的主内容（卡片 / 文章 / 项目文档 / 日记）与外部材料，期间定期让出事件循环 */
  private async forEachCandidate(
    mainDb: Database.Database,
    visit: (task: MainContentVecIndexTask) => void
  ) {
    let processed = 0;
    const handle = async (task: MainContentVecIndexTask) => {
      if (task.content) {
        visit(task);
      }
      processed += 1;
      await yieldEvery(processed, MainContentVecIndexQueue.COLLECT_YIELD_EVERY);
    };

    for (const card of CardTable.getAllCards(mainDb)) {
      await handle({
        id: card.id,
        type: "card",
        content: getMarkdown(card.content || []).trim(),
        sections: splitSections(card.content || [], "", true),
        updateTime: Number(card.update_time || 0),
      });
    }
    await yieldToEventLoop();

    for (const article of ArticleTable.getAllArticles(mainDb)) {
      await handle({
        id: article.id,
        type: "article",
        content: getMarkdown(article.content || []).trim(),
        title: article.title,
        sections: splitSections(article.content || [], article.title || ""),
        updateTime: Number(article.update_time || 0),
      });
    }
    await yieldToEventLoop();

    for (const item of ProjectTable.getAllProjectItems(mainDb)) {
      await handle({
        id: item.id,
        type: "project-item",
        content: getMarkdown(item.content || []).trim(),
        title: item.title,
        sections: splitSections(item.content || [], item.title || ""),
        updateTime: Number(item.updateTime || 0),
      });
    }
    await yieldToEventLoop();

    for (const entry of DiaryTable.getAllDiaryEntries(mainDb)) {
      await handle({
        id: entry.id,
        type: "diary-daily",
        content: getMarkdown(entry.content || []).trim(),
        sections: splitSections(entry.content || [], DiaryTable.getDiarySearchTitle(entry)),
        updateTime: Number(entry.updateTime || 0),
      });
    }
    await yieldToEventLoop();

    for (const doc of listMaterialIndexDocs(mainDb)) {
      await handle(doc);
    }
  }
}

export default new MainContentVecIndexQueue();
