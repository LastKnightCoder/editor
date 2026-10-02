import log from "electron-log";
import type Database from "better-sqlite3";
import { Module } from "../types/module";
import databaseModule, { DatabaseConnectReason } from "./database";
import CardTable from "./tables/card";
import ArticleTable from "./tables/article";
import ProjectTable from "./tables/project";
import DiaryTable from "./tables/diary";
import FTSTable from "./tables/fts";
import { listMaterialIndexDocs } from "./material-index";
import { MAIN_CONTENT_INDEX_TYPES } from "./main-content-vec-index-queue";
import { getMarkdown } from "@/utils/markdown.ts";
import { MAIN_CHUNK_VERSION, splitSections, type ContentSection } from "@/entity/sections";
import type { IndexType } from "@/types";
import { yieldEvery, yieldToEventLoop } from "../utils/event-loop-yield";

interface MainContentFtsIndexTask {
  id: number;
  type: IndexType;
  updateTime: number;
  content: string;
  title?: string;
  sections?: ContentSection[];
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
      let failed = false;

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
          title: task.title,
          sections: task.sections,
          updateTime: task.updateTime,
        });

        if (ok) {
          indexed += 1;
        } else {
          failed = true;
          log.warn(`[MainContentFtsIndexQueue] Index failed: type=${task.type}, id=${task.id}`);
        }

        await new Promise<void>(resolve => {
          setImmediate(resolve);
        });
      }

      if (!failed)
        indexDb
          .prepare(
            "INSERT OR REPLACE INTO index_meta (key, value, updated_at) VALUES ('main_fts_chunk_version', ?, ?)"
          )
          .run(String(MAIN_CHUNK_VERSION), Date.now());
      databaseModule.setIndexRebuildState(dbName, failed ? "pending" : "ready", "fts");
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
    const keep = new Set<string>();
    let removed = 0;
    let processed = 0;

    for (const card of CardTable.getAllCards(mainDb)) {
      removed += this.appendTask(indexDb, tasks, keep, {
        id: card.id,
        type: "card",
        content: getMarkdown(card.content || []).trim(),
        sections: splitSections(card.content || [], "", true),
        updateTime: Number(card.update_time || 0),
      });
      processed += 1;
      await yieldEvery(processed, MainContentFtsIndexQueue.COLLECT_YIELD_EVERY);
    }
    await yieldToEventLoop();

    for (const article of ArticleTable.getAllArticles(mainDb)) {
      removed += this.appendTask(indexDb, tasks, keep, {
        id: article.id,
        type: "article",
        content: getMarkdown(article.content || []).trim(),
        title: article.title,
        sections: splitSections(article.content || [], article.title || ""),
        updateTime: Number(article.update_time || 0),
      });
      processed += 1;
      await yieldEvery(processed, MainContentFtsIndexQueue.COLLECT_YIELD_EVERY);
    }
    await yieldToEventLoop();

    for (const item of ProjectTable.getAllProjectItems(mainDb)) {
      removed += this.appendTask(indexDb, tasks, keep, {
        id: item.id,
        type: "project-item",
        content: getMarkdown(item.content || []).trim(),
        title: item.title,
        sections: splitSections(item.content || [], item.title || ""),
        updateTime: Number(item.updateTime || 0),
      });
      processed += 1;
      await yieldEvery(processed, MainContentFtsIndexQueue.COLLECT_YIELD_EVERY);
    }
    await yieldToEventLoop();

    for (const entry of DiaryTable.getAllDiaryEntries(mainDb)) {
      removed += this.appendTask(indexDb, tasks, keep, {
        id: entry.id,
        type: "diary-daily",
        content: getMarkdown(entry.content || []).trim(),
        sections: splitSections(entry.content || [], DiaryTable.getDiarySearchTitle(entry)),
        updateTime: Number(entry.updateTime || 0),
      });
      processed += 1;
      await yieldEvery(processed, MainContentFtsIndexQueue.COLLECT_YIELD_EVERY);
    }
    await yieldToEventLoop();

    for (const doc of listMaterialIndexDocs(mainDb)) {
      removed += this.appendTask(indexDb, tasks, keep, doc);
      processed += 1;
      await yieldEvery(processed, MainContentFtsIndexQueue.COLLECT_YIELD_EVERY);
    }

    // 已不是候选的（实体已删、摘录软删、剪藏变孤儿）删掉，检索不再命中
    removed += FTSTable.removeIndexesNotIn(indexDb, keep, MAIN_CONTENT_INDEX_TYPES);

    return { tasks, removed };
  }

  private appendTask(
    indexDb: Database.Database,
    tasks: MainContentFtsIndexTask[],
    keep: Set<string>,
    task: MainContentFtsIndexTask
  ): number {
    if (task.content) keep.add(`${task.type}:${task.id}`);
    const indexInfo = FTSTable.checkIndexExists(indexDb, task.id, task.type);

    if (!task.content) {
      if (indexInfo) {
        FTSTable.removeIndexByIdAndType(indexDb, task.id, task.type);
        return 1;
      }
      return 0;
    }

    const version = indexDb
      .prepare("SELECT value FROM index_meta WHERE key = 'main_fts_chunk_version'")
      .get() as { value: string } | undefined;
    if (
      version?.value !== String(MAIN_CHUNK_VERSION) ||
      !indexInfo ||
      indexInfo.updateTime < task.updateTime
    ) {
      tasks.push(task);
    }

    return 0;
  }
}

export default new MainContentFtsIndexQueue();
