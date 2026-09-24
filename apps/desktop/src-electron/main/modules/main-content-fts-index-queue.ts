import log from "electron-log";
import type Database from "better-sqlite3";
import { Module } from "../types/module";
import databaseModule, { DatabaseConnectReason } from "./database";
import CardTable from "./tables/card";
import ArticleTable from "./tables/article";
import ProjectTable from "./tables/project";
import DiaryTable from "./tables/diary";
import FTSTable from "./tables/fts";
import { getMarkdown } from "@/utils/markdown.ts";
import type { IndexType } from "@/types";
import { yieldEvery, yieldToEventLoop } from "../utils/event-loop-yield";

interface MainContentFtsIndexTask {
  id: number;
  type: IndexType;
  updateTime: number;
  content: string;
}

interface CollectTasksResult {
  tasks: MainContentFtsIndexTask[];
  removed: number;
}

class MainContentFtsIndexQueue implements Module {
  name = "main-content-fts-index-queue";
  private generation = 0;
  private runChain: Promise<void> = Promise.resolve();
  private static readonly COLLECT_YIELD_EVERY = 25;

  async init() {
    databaseModule.onDatabaseConnected((dbName, reason) => {
      const generation = ++this.generation;
      this.enqueue(() => this.runReconcile(generation, dbName, reason)).catch(error => {
        log.error("[MainContentFtsIndexQueue] Reconcile failed:", error);
      });
    });
    log.info("[MainContentFtsIndexQueue] Module initialized");
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

  private async runReconcile(generation: number, dbName: string, reason: DatabaseConnectReason) {
    const ensureResult = await databaseModule.ensureIndexDatabaseReady(dbName, `fts:${reason}`);
    if (!ensureResult) {
      log.warn(`[MainContentFtsIndexQueue] Skip reconcile, index ensure skipped: ${dbName}`);
      return;
    }

    const mainDb = databaseModule.getDatabase(dbName);
    const indexDb = databaseModule.getIndexDatabase(dbName);
    if (!mainDb || !indexDb) {
      log.warn(`[MainContentFtsIndexQueue] Database not found: ${dbName}`);
      return;
    }

    const ftsRebuildState = databaseModule.getIndexRebuildState(dbName, "fts");

    if (reason === "sync_upload_reconnect" && ftsRebuildState === "ready") {
      log.info(
        `[MainContentFtsIndexQueue] Skip reconcile after upload reconnect: db=${dbName}, rebuildState=${ftsRebuildState}`
      );
      return;
    }

    databaseModule.setIndexRebuildState(dbName, "building", "fts");

    try {
      const { tasks, removed } = await this.collectTasks(mainDb, indexDb);
      log.info(
        `[MainContentFtsIndexQueue] Reconcile start: db=${dbName}, reason=${reason}, generation=${generation}, queued=${tasks.length}, removed=${removed}`
      );

      let indexed = 0;

      for (const task of tasks) {
        if (this.isStale(generation)) {
          log.info(
            `[MainContentFtsIndexQueue] Reconcile stale: db=${dbName}, reason=${reason}, generation=${generation}, indexed=${indexed}, queued=${tasks.length}, removed=${removed}`
          );
          databaseModule.setIndexRebuildState(dbName, "pending", "fts");
          return;
        }

        const ok = FTSTable.indexContent(indexDb, {
          id: task.id,
          type: task.type,
          content: task.content,
          updateTime: task.updateTime,
        });

        if (ok) {
          indexed += 1;
        } else {
          log.warn(`[MainContentFtsIndexQueue] Index failed: type=${task.type}, id=${task.id}`);
        }

        await new Promise<void>(resolve => {
          setImmediate(resolve);
        });
      }

      databaseModule.setIndexRebuildState(dbName, "ready", "fts");
      log.info(
        `[MainContentFtsIndexQueue] Reconcile done: db=${dbName}, reason=${reason}, generation=${generation}, queued=${tasks.length}, indexed=${indexed}, removed=${removed}`
      );
    } catch (error) {
      databaseModule.setIndexRebuildState(dbName, "failed", "fts");
      throw error;
    }
  }

  private async collectTasks(
    mainDb: Database.Database,
    indexDb: Database.Database
  ): Promise<CollectTasksResult> {
    const tasks: MainContentFtsIndexTask[] = [];
    let removed = 0;
    let processed = 0;

    removed += FTSTable.removeIndexesByType(indexDb, "diary-weekly");
    removed += FTSTable.removeIndexesByType(indexDb, "diary-monthly");

    for (const card of CardTable.getAllCards(mainDb)) {
      removed += this.appendTask(indexDb, tasks, {
        id: card.id,
        type: "card",
        content: getMarkdown(card.content || []).trim(),
        updateTime: Number(card.update_time || 0),
      });
      processed += 1;
      await yieldEvery(processed, MainContentFtsIndexQueue.COLLECT_YIELD_EVERY);
    }
    await yieldToEventLoop();

    for (const article of ArticleTable.getAllArticles(mainDb)) {
      removed += this.appendTask(indexDb, tasks, {
        id: article.id,
        type: "article",
        content: getMarkdown(article.content || []).trim(),
        updateTime: Number(article.update_time || 0),
      });
      processed += 1;
      await yieldEvery(processed, MainContentFtsIndexQueue.COLLECT_YIELD_EVERY);
    }
    await yieldToEventLoop();

    for (const item of ProjectTable.getAllProjectItems(mainDb)) {
      removed += this.appendTask(indexDb, tasks, {
        id: item.id,
        type: "project-item",
        content: getMarkdown(item.content || []).trim(),
        updateTime: Number(item.updateTime || 0),
      });
      processed += 1;
      await yieldEvery(processed, MainContentFtsIndexQueue.COLLECT_YIELD_EVERY);
    }
    await yieldToEventLoop();

    for (const entry of DiaryTable.getAllDiaryEntries(mainDb)) {
      removed += this.appendTask(indexDb, tasks, {
        id: entry.id,
        type: "diary-daily",
        content: getMarkdown(entry.content || []).trim(),
        updateTime: Number(entry.updateTime || 0),
      });
      processed += 1;
      await yieldEvery(processed, MainContentFtsIndexQueue.COLLECT_YIELD_EVERY);
    }

    return { tasks, removed };
  }

  private appendTask(
    indexDb: Database.Database,
    tasks: MainContentFtsIndexTask[],
    task: MainContentFtsIndexTask
  ): number {
    const indexInfo = FTSTable.checkIndexExists(indexDb, task.id, task.type);

    if (!task.content) {
      if (indexInfo) {
        FTSTable.removeIndexByIdAndType(indexDb, task.id, task.type);
        return 1;
      }
      return 0;
    }

    if (!indexInfo || indexInfo.updateTime < task.updateTime) {
      tasks.push(task);
    }

    return 0;
  }
}

export default new MainContentFtsIndexQueue();
