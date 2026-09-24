import log from "electron-log";
import type Database from "better-sqlite3";
import { Module } from "../types/module";
import databaseModule from "./database";
import CardTable from "./tables/card";
import ArticleTable from "./tables/article";
import ProjectTable from "./tables/project";
import DiaryTable from "./tables/diary";
import VecDocumentTable from "./tables/vec-document";
import { getMarkdown } from "@/utils/markdown.ts";
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

interface MainContentVecIndexTask {
  id: number;
  type: IndexType;
  updateTime: number;
  content: string;
}

interface ReconcileByPolicyParams {
  mainDbName: string;
  embeddingConfig: ResolvedEmbeddingConfig;
  fingerprintChanged: boolean;
  autoIndex: boolean;
  reason: MainContentReconcileReason;
}

export interface MainContentReconcileResult {
  generation: number;
  reason: MainContentReconcileReason;
  reinitialized: boolean;
  queued: number;
  indexed: number;
  stale: boolean;
  autoIndex: boolean;
}

class MainContentVecIndexQueue implements Module {
  name = "main-content-vec-index-queue";
  private generation = 0;
  private runChain: Promise<void> = Promise.resolve();
  private static readonly COLLECT_YIELD_EVERY = 25;

  async init() {
    log.info("[MainContentVecIndexQueue] Module initialized");
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
        stale: false,
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
        stale: false,
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
        stale: false,
        autoIndex: false,
      };
    }

    databaseModule.setIndexRebuildState(params.mainDbName, "building", "vec");
    log.info(
      `[MainContentVecIndexQueue] Vector index switched to building: db=${params.mainDbName}, reason=${params.reason}, generation=${generation}, searchableDuringBuilding=true`
    );

    const tasks = await this.collectTasks(mainDb, indexDb, params.fingerprintChanged);
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
      let indexed = 0;
      let consecutiveFailures = 0;
      for (const task of tasks) {
        if (this.isStale(generation)) {
          log.info(
            `[MainContentVecIndexQueue] Drop stale task generation=${generation} current=${this.generation}`
          );
          databaseModule.setIndexRebuildState(params.mainDbName, "pending", "vec");
          return {
            generation,
            reason: params.reason,
            reinitialized,
            queued: tasks.length,
            indexed,
            stale: true,
            autoIndex: true,
          };
        }

        const ok = await VecDocumentTable.indexContent(indexDb, {
          id: task.id,
          type: task.type,
          content: task.content,
          updateTime: task.updateTime,
          modelInfo,
        });

        if (ok) {
          indexed += 1;
          consecutiveFailures = 0;
        } else {
          consecutiveFailures += 1;
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

      databaseModule.setIndexRebuildState(params.mainDbName, "ready", "vec");
      log.info(
        `[MainContentVecIndexQueue] Reconcile done: reason=${params.reason}, generation=${generation}, queued=${tasks.length}, indexed=${indexed}, reinitialized=${reinitialized}, searchableDuringBuilding=true`
      );
      return {
        generation,
        reason: params.reason,
        reinitialized,
        queued: tasks.length,
        indexed,
        stale: false,
        autoIndex: true,
      };
    } catch (error) {
      databaseModule.setIndexRebuildState(params.mainDbName, "failed", "vec");
      throw error;
    }
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
    let processed = 0;

    VecDocumentTable.removeIndexesByType(indexDb, "diary-weekly");
    VecDocumentTable.removeIndexesByType(indexDb, "diary-monthly");

    for (const card of CardTable.getAllCards(mainDb)) {
      this.appendTask(
        indexDb,
        tasks,
        {
          id: card.id,
          type: "card",
          content: getMarkdown(card.content || []).trim(),
          updateTime: Number(card.update_time || 0),
        },
        forceReindex
      );
      processed += 1;
      await yieldEvery(processed, MainContentVecIndexQueue.COLLECT_YIELD_EVERY);
    }
    await yieldToEventLoop();

    for (const article of ArticleTable.getAllArticles(mainDb)) {
      this.appendTask(
        indexDb,
        tasks,
        {
          id: article.id,
          type: "article",
          content: getMarkdown(article.content || []).trim(),
          updateTime: Number(article.update_time || 0),
        },
        forceReindex
      );
      processed += 1;
      await yieldEvery(processed, MainContentVecIndexQueue.COLLECT_YIELD_EVERY);
    }
    await yieldToEventLoop();

    for (const item of ProjectTable.getAllProjectItems(mainDb)) {
      this.appendTask(
        indexDb,
        tasks,
        {
          id: item.id,
          type: "project-item",
          content: getMarkdown(item.content || []).trim(),
          updateTime: Number(item.updateTime || 0),
        },
        forceReindex
      );
      processed += 1;
      await yieldEvery(processed, MainContentVecIndexQueue.COLLECT_YIELD_EVERY);
    }
    await yieldToEventLoop();

    for (const entry of DiaryTable.getAllDiaryEntries(mainDb)) {
      this.appendTask(
        indexDb,
        tasks,
        {
          id: entry.id,
          type: "diary-daily",
          content: getMarkdown(entry.content || []).trim(),
          updateTime: Number(entry.updateTime || 0),
        },
        forceReindex
      );
      processed += 1;
      await yieldEvery(processed, MainContentVecIndexQueue.COLLECT_YIELD_EVERY);
    }

    return tasks;
  }

  private appendTask(
    indexDb: Database.Database,
    tasks: MainContentVecIndexTask[],
    task: MainContentVecIndexTask,
    forceReindex: boolean
  ) {
    if (!task.content) {
      return;
    }

    if (forceReindex) {
      tasks.push(task);
      return;
    }

    const indexInfo = VecDocumentTable.checkIndexExists(indexDb, task.id, task.type);
    if (!indexInfo || indexInfo.updateTime < task.updateTime) {
      tasks.push(task);
    }
  }
}

export default new MainContentVecIndexQueue();
