import log from "electron-log";
import type Database from "better-sqlite3";
import { Module } from "../types/module";
import databaseModule, { DatabaseConnectReason } from "./database";
import CardTable from "./tables/card";
import ArticleTable from "./tables/article";
import ProjectTable from "./tables/project";
import DocumentTable from "./tables/document";
import DiaryTable from "./tables/diary";
import FTSTable from "./tables/fts";
import { getMarkdown } from "@/utils/markdown.ts";
import type { IndexType } from "@/types";

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

  async init() {
    databaseModule.onDatabaseConnected((dbName, reason) => {
      const generation = ++this.generation;
      this.enqueue(() => this.runReconcile(generation, dbName, reason)).catch(
        (error) => {
          log.error("[MainContentFtsIndexQueue] Reconcile failed:", error);
        },
      );
    });
    log.info("[MainContentFtsIndexQueue] Module initialized");
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
    dbName: string,
    reason: DatabaseConnectReason,
  ) {
    const db = databaseModule.getDatabase(dbName);
    if (!db) {
      log.warn(`[MainContentFtsIndexQueue] Database not found: ${dbName}`);
      return;
    }

    const { tasks, removed } = this.collectTasks(db);
    log.info(
      `[MainContentFtsIndexQueue] Reconcile start: db=${dbName}, reason=${reason}, generation=${generation}, queued=${tasks.length}, removed=${removed}`,
    );

    let indexed = 0;

    for (const task of tasks) {
      if (this.isStale(generation)) {
        log.info(
          `[MainContentFtsIndexQueue] Reconcile stale: db=${dbName}, reason=${reason}, generation=${generation}, indexed=${indexed}, queued=${tasks.length}, removed=${removed}`,
        );
        return;
      }

      const ok = FTSTable.indexContent(db, {
        id: task.id,
        type: task.type,
        content: task.content,
        updateTime: task.updateTime,
      });

      if (ok) {
        indexed += 1;
      } else {
        log.warn(
          `[MainContentFtsIndexQueue] Index failed: type=${task.type}, id=${task.id}`,
        );
      }

      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
    }

    log.info(
      `[MainContentFtsIndexQueue] Reconcile done: db=${dbName}, reason=${reason}, generation=${generation}, queued=${tasks.length}, indexed=${indexed}, removed=${removed}`,
    );
  }

  private collectTasks(db: Database.Database): CollectTasksResult {
    const tasks: MainContentFtsIndexTask[] = [];
    let removed = 0;

    for (const card of CardTable.getAllCards(db)) {
      removed += this.appendTask(db, tasks, {
        id: card.id,
        type: "card",
        content: getMarkdown(card.content || []).trim(),
        updateTime: Number(card.update_time || 0),
      });
    }

    for (const article of ArticleTable.getAllArticles(db)) {
      removed += this.appendTask(db, tasks, {
        id: article.id,
        type: "article",
        content: getMarkdown(article.content || []).trim(),
        updateTime: Number(article.update_time || 0),
      });
    }

    for (const item of ProjectTable.getAllProjectItems(db)) {
      removed += this.appendTask(db, tasks, {
        id: item.id,
        type: "project-item",
        content: getMarkdown(item.content || []).trim(),
        updateTime: Number(item.updateTime || 0),
      });
    }

    for (const item of DocumentTable.getAllDocumentItems(db)) {
      removed += this.appendTask(db, tasks, {
        id: item.id,
        type: "document-item",
        content: getMarkdown(item.content || []).trim(),
        updateTime: Number(item.updateTime || 0),
      });
    }

    for (const entry of DiaryTable.getAllDiaryEntries(db)) {
      removed += this.appendTask(db, tasks, {
        id: entry.id,
        type: `diary-${entry.type}` as IndexType,
        content: getMarkdown(entry.content || []).trim(),
        updateTime: Number(entry.updateTime || 0),
      });
    }

    return { tasks, removed };
  }

  private appendTask(
    db: Database.Database,
    tasks: MainContentFtsIndexTask[],
    task: MainContentFtsIndexTask,
  ): number {
    const indexInfo = FTSTable.checkIndexExists(db, task.id, task.type);

    if (!task.content) {
      if (indexInfo) {
        FTSTable.removeIndexByIdAndType(db, task.id, task.type);
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
