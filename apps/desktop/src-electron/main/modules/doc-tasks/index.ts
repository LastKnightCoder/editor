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
import { broadcastScheduleChange } from "../schedule-changes";
import { listTaskGroups } from "./group-names";
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
  private generations = new Map<string, number>();
  /** 串行执行对账与增量，避免同一索引库上交错写入 */
  private chains = new Map<string, Promise<unknown>>();
  private pending = new Map<string, Set<number>>();
  private timers = new Map<string, NodeJS.Timeout>();
  private deadlines = new Map<string, number>();

  async init() {
    ipcMain.handle("doc-tasks:groups", async (event, scope: unknown) => {
      const dbs = await this.senderDatabases(event.sender, "ipc:doc-tasks", scope);
      return listTaskGroups(dbs.mainDb);
    });
    ipcMain.handle("doc-tasks:snapshot", async (event, scope: unknown) => {
      const dbs = await this.senderDatabases(event.sender, "ipc:doc-tasks", scope);
      return getDocTaskSnapshot(dbs.mainDb, dbs.indexDb);
    });
    ipcMain.handle("doc-tasks:of-content", async (event, contentId: unknown, scope: unknown) => {
      const dbs = await this.senderDatabases(event.sender, "ipc:doc-tasks", scope);
      return getDocTasksOf(dbs.mainDb, dbs.indexDb, this.parseContentId(contentId));
    });
    ipcMain.handle(
      "doc-tasks:content-status",
      async (event, contentId: unknown, scope: unknown) => {
        const dbs = await this.senderDatabases(event.sender, "ipc:doc-tasks", scope);
        return getDocTaskContentStatus(dbs.mainDb, dbs.indexDb, this.parseContentId(contentId));
      }
    );
    ipcMain.handle(
      "doc-tasks:set-excluded",
      async (event, contentId: unknown, excluded: unknown, scope: unknown) => {
        const { dbName, ...dbs } = await this.senderDatabases(event.sender, "ipc:doc-tasks", scope);
        setContentExcluded(dbs.mainDb, this.parseContentId(contentId), excluded === true);
        broadcastDatabaseChange(DOC_TASKS_CHANGED, dbName);
      }
    );
    ipcMain.handle(
      "doc-tasks:promote",
      async (
        event,
        contentId: unknown,
        taskId: unknown,
        fallbackGroupId: unknown,
        scope: unknown
      ) => {
        if (typeof taskId !== "string" || !taskId) throw new Error("taskId 无效");
        const { dbName, ...dbs } = await this.senderDatabases(event.sender, "ipc:doc-tasks", scope);
        const group = Number(fallbackGroupId);
        const result = promoteDocTask(
          dbs.mainDb,
          dbs.indexDb,
          this.parseContentId(contentId),
          taskId,
          Number.isSafeInteger(group) && group > 0 ? group : null
        );
        broadcastDatabaseChange(DOC_TASKS_CHANGED, dbName);
        if (result.ok) broadcastScheduleChange(dbName);
        return result;
      }
    );
    ipcMain.handle(
      "doc-tasks:toggle",
      async (event, contentId: unknown, taskId: unknown, checked: unknown, scope: unknown) => {
        if (typeof taskId !== "string" || !taskId) throw new Error("taskId 无效");
        const { dbName, ...dbs } = await this.senderDatabases(event.sender, "ipc:doc-tasks", scope);
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
    const connect = (dbName: string) => {
      const generation = (this.generations.get(dbName) ?? 0) + 1;
      this.generations.set(dbName, generation);
      this.enqueue(dbName, () => this.reconcile(dbName, generation));
    };
    databaseModule.onDatabaseConnected(connect);
    onContentWritten(({ dbName, contentId }) => this.schedule(dbName, contentId));
    databaseModule.onDatabaseWrite((dbName, eventName) => {
      if (GROUP_WRITE_EVENTS.has(eventName)) this.enqueue(dbName, () => this.regroup(dbName));
    });
    for (const [name, db] of databaseModule.databases) if (db.open) connect(name);
    log.info("[DocTasks] Module initialized");
  }

  private enqueue(dbName: string, task: () => Promise<void>) {
    const chain = (this.chains.get(dbName) ?? Promise.resolve()).then(task).catch(error => {
      log.error("[DocTasks] 任务失败", error);
      for (const id of this.pending.get(dbName) ?? []) this.schedule(dbName, id);
    });
    this.chains.set(dbName, chain);
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
    if (!mainDb.open || databaseModule.getDatabase(dbName) !== mainDb) return null;
    const indexDb = databaseModule.getIndexDatabase(dbName);
    return indexDb ? { mainDb, indexDb } : null;
  }

  private async senderDatabases(sender: Electron.WebContents, reason: string, scope: unknown) {
    const win = BrowserWindow.fromWebContents(sender);
    const dbName = win ? databaseModule.windowToDatabase.get(win.id) : undefined;
    if (!dbName) throw new Error("No database name found");
    const expected =
      scope && typeof scope === "object"
        ? (scope as { databaseName?: unknown }).databaseName
        : undefined;
    if (
      typeof expected !== "string" ||
      databaseModule.formatDatabaseName(expected) !== databaseModule.formatDatabaseName(dbName)
    )
      throw new Error("数据库已切换，请重新操作");
    const dbs = await this.databases(dbName, reason);
    if (!dbs) throw new Error("数据库未就绪");
    if (
      databaseModule.windowToDatabase.get(win!.id) !== dbName ||
      !dbs.mainDb.open ||
      databaseModule.getDatabase(dbName) !== dbs.mainDb
    )
      throw new Error("数据库正在切换，请稍后重试");
    return { ...dbs, dbName };
  }

  private async reconcile(dbName: string, generation: number) {
    const dbs = await this.databases(dbName, "doc-tasks:reconcile");
    if (!dbs || generation !== this.generations.get(dbName)) return;
    await this.regroup(dbName);
    const startedAt = Date.now();
    const result = await reconcileDocTasks(
      dbs.mainDb,
      dbs.indexDb,
      () =>
        generation !== this.generations.get(dbName) ||
        databaseModule.getIndexDatabase(dbName) !== dbs.indexDb ||
        !dbs.mainDb.open,
      (contentId, error) => {
        log.error("[DocTasks] 对账文档失败", { dbName, contentId }, error);
        this.schedule(dbName, contentId, 5_000);
      },
      contentId => this.schedule(dbName, contentId, 5_000)
    );
    log.info(
      `[DocTasks] reconcile db=${dbName} processed=${result.processed} changed=${result.changed} aborted=${result.aborted} elapsedMs=${Date.now() - startedAt}`
    );
    if (result.changed > 0) broadcastDatabaseChange(DOC_TASKS_CHANGED, dbName);
  }

  private schedule(dbName: string, contentId: number, delay = DEBOUNCE_MS) {
    const ids = this.pending.get(dbName) ?? new Set<number>();
    ids.add(contentId);
    this.pending.set(dbName, ids);
    const deadline = Date.now() + delay;
    if (this.timers.has(dbName) && (this.deadlines.get(dbName) ?? Infinity) <= deadline) return;
    clearTimeout(this.timers.get(dbName));
    this.deadlines.set(dbName, deadline);
    this.timers.set(
      dbName,
      setTimeout(() => {
        this.timers.delete(dbName);
        this.deadlines.delete(dbName);
        const batch = [...(this.pending.get(dbName) ?? [])];
        this.pending.delete(dbName);
        this.enqueue(dbName, () => this.reindex(dbName, batch));
      }, delay)
    );
  }

  private async reindex(dbName: string, contentIds: number[]) {
    // 索引库未就绪（未连接过的库）时跳过，下次连接的对账会补上
    if (!databaseModule.getIndexDatabase(dbName)) return;
    const dbs = await this.databases(dbName, "doc-tasks:incremental");
    if (!dbs) return;
    let changed = 0;
    for (const contentId of contentIds) {
      try {
        const result = reindexDocTasks(dbs.mainDb, dbs.indexDb, [contentId]);
        changed += result.changed;
        result.pending?.forEach(id => this.schedule(dbName, id, 5_000));
      } catch (error) {
        log.error("[DocTasks] 文档索引失败", { dbName, contentId }, error);
        this.schedule(dbName, contentId, 5_000);
      }
    }
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
    const ids = (
      dbs.mainDb
        .prepare(`SELECT id FROM contents WHERE instr(content, '"check-list-item"') > 0`)
        .all() as Array<{ id: number }>
    ).map(row => row.id);
    if (renamed.size) await this.reindex(dbName, ids);
  }
}

export default new DocTasksModule();
