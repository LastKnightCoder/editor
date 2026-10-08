/**
 * 文档待办模块：维护索引库 doc_tasks，并提供待办页的查询与勾选回写。
 *
 * - 数据库连接时整库对账（切库即作废进行中的一轮）；
 * - 正文写入总线触发增量重建，1 秒防抖；
 * - 项目增删改名后按已存原文重算项目归属；
 * - 任何变化后广播 doc-tasks:changed，渲染端据此失效查询。
 */

import type Database from "better-sqlite3";
import { BrowserWindow, ipcMain } from "electron";
import log from "electron-log";
import type { Module } from "../../types/module";
import { onContentWritten } from "../content-events";
import databaseModule from "../database";
import { broadcastDatabaseChange } from "../database-notifications";
import { reconcileDocTasks, regroupDocTasks, reindexDocTasks } from "./indexer";
import { getDocTaskContentStatus, getDocTaskSnapshot, getDocTasksOf, toggleDocTask } from "./query";
import {
  detectGroupRenames,
  promoteDocTask,
  renameGroupTokens,
  setContentExcluded,
} from "./settings";

export const DOC_TASKS_CHANGED = "doc-tasks:changed";
const DEBOUNCE_MS = 1_000;
const GROUP_WRITE_EVENTS = new Set([
  "todo:create-group",
  "todo:update-group",
  "todo:archive-group",
  "todo:delete-group",
]);

class DocTasksModule implements Module {
  name = "doc-tasks";
  private generation = 0;
  /** 串行执行对账与增量，避免同一索引库上交错写入 */
  private chain: Promise<unknown> = Promise.resolve();
  private pending = new Map<string, Set<number>>();
  private timers = new Map<string, NodeJS.Timeout>();

  async init() {
    ipcMain.handle("doc-tasks:snapshot", async event => {
      const dbs = await this.senderDatabases(event.sender, "ipc:doc-tasks");
      return getDocTaskSnapshot(dbs.mainDb, dbs.indexDb);
    });
    ipcMain.handle("doc-tasks:of-content", async (event, contentId: unknown) => {
      const dbs = await this.senderDatabases(event.sender, "ipc:doc-tasks");
      return getDocTasksOf(dbs.mainDb, dbs.indexDb, this.parseContentId(contentId));
    });
    ipcMain.handle("doc-tasks:content-status", async (event, contentId: unknown) => {
      const dbs = await this.senderDatabases(event.sender, "ipc:doc-tasks");
      return getDocTaskContentStatus(dbs.mainDb, dbs.indexDb, this.parseContentId(contentId));
    });
    ipcMain.handle(
      "doc-tasks:set-excluded",
      async (event, contentId: unknown, excluded: unknown) => {
        const { dbName, ...dbs } = await this.senderDatabases(event.sender, "ipc:doc-tasks");
        setContentExcluded(dbs.mainDb, this.parseContentId(contentId), excluded === true);
        broadcastDatabaseChange(DOC_TASKS_CHANGED, dbName);
      }
    );
    ipcMain.handle(
      "doc-tasks:promote",
      async (event, contentId: unknown, taskId: unknown, fallbackGroupId: unknown) => {
        if (typeof taskId !== "string" || !taskId) throw new Error("taskId 无效");
        const { dbName, ...dbs } = await this.senderDatabases(event.sender, "ipc:doc-tasks");
        const group = Number(fallbackGroupId);
        const result = promoteDocTask(
          dbs.mainDb,
          dbs.indexDb,
          this.parseContentId(contentId),
          taskId,
          Number.isSafeInteger(group) && group > 0 ? group : null
        );
        broadcastDatabaseChange(DOC_TASKS_CHANGED, dbName);
        return result;
      }
    );
    ipcMain.handle(
      "doc-tasks:toggle",
      async (event, contentId: unknown, taskId: unknown, checked: unknown) => {
        if (typeof taskId !== "string" || !taskId) throw new Error("taskId 无效");
        const { dbName, ...dbs } = await this.senderDatabases(event.sender, "ipc:doc-tasks");
        const result = toggleDocTask(
          dbs.mainDb,
          dbs.indexDb,
          this.parseContentId(contentId),
          taskId,
          checked === true
        );
        broadcastDatabaseChange(DOC_TASKS_CHANGED, dbName);
        return result;
      }
    );
    databaseModule.onDatabaseConnected(dbName => {
      const generation = ++this.generation;
      this.enqueue(() => this.reconcile(dbName, generation));
    });
    onContentWritten(({ dbName, contentId }) => this.schedule(dbName, contentId));
    databaseModule.onDatabaseWrite((dbName, eventName) => {
      if (GROUP_WRITE_EVENTS.has(eventName)) this.enqueue(() => this.regroup(dbName));
    });
    log.info("[DocTasks] Module initialized");
  }

  private enqueue(task: () => Promise<void>) {
    this.chain = this.chain.then(task).catch(error => log.error("[DocTasks] 任务失败", error));
  }

  private parseContentId(raw: unknown): number {
    const id = Number(raw);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error("contentId 无效");
    return id;
  }

  private async databases(
    dbName: string,
    reason: string
  ): Promise<{ mainDb: Database.Database; indexDb: Database.Database } | null> {
    const mainDb = databaseModule.getDatabase(dbName);
    if (!mainDb?.open) return null;
    await databaseModule.ensureIndexDatabaseReady(dbName, reason);
    const indexDb = databaseModule.getIndexDatabase(dbName);
    return indexDb ? { mainDb, indexDb } : null;
  }

  private async senderDatabases(sender: Electron.WebContents, reason: string) {
    const win = BrowserWindow.fromWebContents(sender);
    const dbName = win ? databaseModule.windowToDatabase.get(win.id) : undefined;
    if (!dbName) throw new Error("No database name found");
    const dbs = await this.databases(dbName, reason);
    if (!dbs) throw new Error("数据库未就绪");
    return { ...dbs, dbName };
  }

  private async reconcile(dbName: string, generation: number) {
    const dbs = await this.databases(dbName, "doc-tasks:reconcile");
    if (!dbs || generation !== this.generation) return;
    const startedAt = Date.now();
    const result = await reconcileDocTasks(
      dbs.mainDb,
      dbs.indexDb,
      () =>
        generation !== this.generation || databaseModule.getIndexDatabase(dbName) !== dbs.indexDb
    );
    log.info(
      `[DocTasks] reconcile db=${dbName} processed=${result.processed} changed=${result.changed} aborted=${result.aborted} elapsedMs=${Date.now() - startedAt}`
    );
    if (result.changed > 0) broadcastDatabaseChange(DOC_TASKS_CHANGED, dbName);
  }

  private schedule(dbName: string, contentId: number) {
    const ids = this.pending.get(dbName) ?? new Set<number>();
    ids.add(contentId);
    this.pending.set(dbName, ids);
    clearTimeout(this.timers.get(dbName));
    this.timers.set(
      dbName,
      setTimeout(() => {
        this.timers.delete(dbName);
        const batch = [...(this.pending.get(dbName) ?? [])];
        this.pending.delete(dbName);
        this.enqueue(() => this.reindex(dbName, batch));
      }, DEBOUNCE_MS)
    );
  }

  private async reindex(dbName: string, contentIds: number[]) {
    // 索引库未就绪（未连接过的库）时跳过，下次连接的对账会补上
    if (!databaseModule.getIndexDatabase(dbName)) return;
    const dbs = await this.databases(dbName, "doc-tasks:incremental");
    if (!dbs) return;
    const { changed } = reindexDocTasks(dbs.mainDb, dbs.indexDb, contentIds);
    if (changed > 0) broadcastDatabaseChange(DOC_TASKS_CHANGED, dbName);
  }

  /** 项目变化：先把改名同步进正文（正文写入会触发增量重建），再按原文重算归属 */
  private async regroup(dbName: string) {
    if (!databaseModule.getIndexDatabase(dbName)) return;
    const dbs = await this.databases(dbName, "doc-tasks:regroup");
    if (!dbs) return;
    const renamed = new Set<number>();
    for (const rename of detectGroupRenames(dbs.mainDb, dbs.indexDb)) {
      const changed = renameGroupTokens(
        dbs.mainDb,
        dbs.indexDb,
        rename.groupId,
        rename.oldTitle,
        rename.newTitle
      );
      renamed.add(rename.groupId);
      log.info(`[DocTasks] group rename db=${dbName} group=${rename.groupId} contents=${changed}`);
    }
    // 改名项目的条目等正文改写后的增量重建来更新，这里不按旧原文重算（否则会先丢掉归属）
    if (regroupDocTasks(dbs.mainDb, dbs.indexDb, renamed) > 0)
      broadcastDatabaseChange(DOC_TASKS_CHANGED, dbName);
  }
}

export default new DocTasksModule();
