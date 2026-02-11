import log from "electron-log";
import type Database from "better-sqlite3";
import { Module } from "../types/module";
import databaseModule from "./database";
import CardTable from "./tables/card";
import ArticleTable from "./tables/article";
import ProjectTable from "./tables/project";
import DocumentTable from "./tables/document";
import DiaryTable from "./tables/diary";
import VecDocumentTable from "./tables/vec-document";
import { getMarkdown } from "@/utils/markdown.ts";
import type { IndexType } from "@/types";
import type { ResolvedEmbeddingConfig } from "../utils/embedding-config";

export type MainContentReconcileReason =
  | "config_switch"
  | "model_switch"
  | "db_switch"
  | "startup_reconcile";

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

  async init() {
    log.info("[MainContentVecIndexQueue] Module initialized");
  }

  async reconcileByPolicy(
    params: ReconcileByPolicyParams,
  ): Promise<MainContentReconcileResult> {
    const generation = ++this.generation;
    return this.enqueue(() => this.runReconcile(generation, params));
  }

  private async enqueue<T>(task: () => Promise<T>): Promise<T> {
    const nextTask = this.runChain.then(task, task);
    this.runChain = nextTask.then(
      () => undefined,
      () => undefined,
    );
    return nextTask;
  }

  private isStale(generation: number): boolean {
    return generation !== this.generation;
  }

  private async runReconcile(
    generation: number,
    params: ReconcileByPolicyParams,
  ): Promise<MainContentReconcileResult> {
    const db = databaseModule.getDatabase(params.mainDbName);
    if (!db) {
      log.warn(
        `[MainContentVecIndexQueue] Database not found: ${params.mainDbName}`,
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

    let reinitialized = false;

    if (params.fingerprintChanged) {
      VecDocumentTable.clearTableData(db);
      if (params.embeddingConfig.dimensions > 0) {
        VecDocumentTable.initTableByVecLength(
          db,
          params.embeddingConfig.dimensions,
        );
      }
      reinitialized = true;
    } else if (params.autoIndex) {
      this.ensureVecTableReady(db, params.embeddingConfig.dimensions);
    }

    if (!params.autoIndex) {
      log.info(
        `[MainContentVecIndexQueue] Skip auto indexing: reason=${params.reason}, provider=${params.embeddingConfig.providerType}`,
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

    const tasks = this.collectTasks(db, params.fingerprintChanged);
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

    let indexed = 0;
    for (const task of tasks) {
      if (this.isStale(generation)) {
        log.info(
          `[MainContentVecIndexQueue] Drop stale task generation=${generation} current=${this.generation}`,
        );
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

      const ok = await VecDocumentTable.indexContent(db, {
        id: task.id,
        type: task.type,
        content: task.content,
        updateTime: task.updateTime,
        modelInfo,
      });

      if (ok) {
        indexed += 1;
      } else {
        log.warn(
          `[MainContentVecIndexQueue] Index failed: type=${task.type}, id=${task.id}`,
        );
      }
    }

    log.info(
      `[MainContentVecIndexQueue] Reconcile done: reason=${params.reason}, generation=${generation}, queued=${tasks.length}, indexed=${indexed}, reinitialized=${reinitialized}`,
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
  }

  private ensureVecTableReady(db: Database.Database, dimensions: number) {
    const tableExists = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='vec_documents'",
      )
      .get();
    if (!tableExists && dimensions > 0) {
      VecDocumentTable.initTableByVecLength(db, dimensions);
    }
  }

  private collectTasks(
    db: Database.Database,
    forceReindex: boolean,
  ): MainContentVecIndexTask[] {
    const tasks: MainContentVecIndexTask[] = [];

    for (const card of CardTable.getAllCards(db)) {
      this.appendTask(
        db,
        tasks,
        {
          id: card.id,
          type: "card",
          content: getMarkdown(card.content || []).trim(),
          updateTime: Number(card.update_time || 0),
        },
        forceReindex,
      );
    }

    for (const article of ArticleTable.getAllArticles(db)) {
      this.appendTask(
        db,
        tasks,
        {
          id: article.id,
          type: "article",
          content: getMarkdown(article.content || []).trim(),
          updateTime: Number(article.update_time || 0),
        },
        forceReindex,
      );
    }

    for (const item of ProjectTable.getAllProjectItems(db)) {
      this.appendTask(
        db,
        tasks,
        {
          id: item.id,
          type: "project-item",
          content: getMarkdown(item.content || []).trim(),
          updateTime: Number(item.updateTime || 0),
        },
        forceReindex,
      );
    }

    for (const item of DocumentTable.getAllDocumentItems(db)) {
      this.appendTask(
        db,
        tasks,
        {
          id: item.id,
          type: "document-item",
          content: getMarkdown(item.content || []).trim(),
          updateTime: Number(item.updateTime || 0),
        },
        forceReindex,
      );
    }

    for (const entry of DiaryTable.getAllDiaryEntries(db)) {
      this.appendTask(
        db,
        tasks,
        {
          id: entry.id,
          type: `diary-${entry.type}` as IndexType,
          content: getMarkdown(entry.content || []).trim(),
          updateTime: Number(entry.updateTime || 0),
        },
        forceReindex,
      );
    }

    return tasks;
  }

  private appendTask(
    db: Database.Database,
    tasks: MainContentVecIndexTask[],
    task: MainContentVecIndexTask,
    forceReindex: boolean,
  ) {
    if (!task.content) {
      return;
    }

    if (forceReindex) {
      tasks.push(task);
      return;
    }

    const indexInfo = VecDocumentTable.checkIndexExists(db, task.id, task.type);
    if (!indexInfo || indexInfo.updateTime < task.updateTime) {
      tasks.push(task);
    }
  }
}

export default new MainContentVecIndexQueue();
