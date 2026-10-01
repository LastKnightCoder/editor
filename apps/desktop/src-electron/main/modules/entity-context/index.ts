/**
 * 脉络模块：维护索引库的引用索引，并提供 entity-context:get。
 *
 * - 数据库连接时整库对账（切库即作废进行中的一轮），引用索引与白板引用索引各一轮；
 * - 正文写入总线触发增量重建，2 秒防抖；白板写事件触发白板对账，同样防抖；
 * - 引用或实体、问题材料变化后广播 entity-context:changed，渲染端据此失效查询。
 */

import type Database from "better-sqlite3";
import { BrowserWindow, ipcMain } from "electron";
import log from "electron-log";
import { normalizeEntityRefKind, type EntityRef } from "@/entity/ref";
import type { EntityContext } from "@/types/entity-context";
import type { Module } from "../../types/module";
import { onContentWritten } from "../content-events";
import databaseModule from "../database";
import { broadcastDatabaseChange } from "../database-notifications";
import { getEntityContext } from "./context-query";
import { reconcileRefs, reindexContents } from "./ref-indexer";
import { reconcileWhiteboardRefs } from "./whiteboard-indexer";
import { CONTEXT_WRITE_EVENTS, WHITEBOARD_CANVAS_EVENTS } from "./write-events";

export const ENTITY_CONTEXT_CHANGED = "entity-context:changed";
const DEBOUNCE_MS = 2_000;

class EntityContextModule implements Module {
  name = "entity-context";
  /** 每次连接自增；进行中的对账发现代次变化即停止 */
  private generation = 0;
  /** 串行执行对账与增量，避免同一索引库上交错写入 */
  private chain: Promise<unknown> = Promise.resolve();
  private pending = new Map<string, Set<number>>();
  private timers = new Map<string, NodeJS.Timeout>();
  private whiteboardTimers = new Map<string, NodeJS.Timeout>();

  async init() {
    ipcMain.handle("entity-context:get", (event, ref: unknown) =>
      this.handleGet(event.sender, ref)
    );
    databaseModule.onDatabaseConnected(dbName => {
      const generation = ++this.generation;
      this.enqueue(() => this.reconcile(dbName, generation));
      this.enqueue(() => this.reconcileWhiteboards(dbName, generation));
    });
    onContentWritten(({ dbName, contentId }) => this.schedule(dbName, contentId));
    databaseModule.onDatabaseWrite((dbName, eventName) => {
      if (CONTEXT_WRITE_EVENTS.has(eventName))
        broadcastDatabaseChange(ENTITY_CONTEXT_CHANGED, dbName);
      if (WHITEBOARD_CANVAS_EVENTS.has(eventName)) this.scheduleWhiteboards(dbName);
    });
    log.info("[EntityContext] Module initialized");
  }

  private enqueue(task: () => Promise<void>) {
    this.chain = this.chain.then(task).catch(error => log.error("[EntityContext] 任务失败", error));
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

  private async reconcile(dbName: string, generation: number) {
    const dbs = await this.databases(dbName, "entity-refs:reconcile");
    if (!dbs || generation !== this.generation) return;
    const startedAt = Date.now();
    const result = await reconcileRefs(
      dbs.mainDb,
      dbs.indexDb,
      () =>
        generation !== this.generation || databaseModule.getIndexDatabase(dbName) !== dbs.indexDb
    );
    log.info(
      `[EntityContext] reconcile db=${dbName} processed=${result.processed} changed=${result.changed} aborted=${result.aborted} elapsedMs=${Date.now() - startedAt}`
    );
    if (result.changed > 0) broadcastDatabaseChange(ENTITY_CONTEXT_CHANGED, dbName);
  }

  private async reconcileWhiteboards(dbName: string, generation: number) {
    const dbs = await this.databases(dbName, "whiteboard-refs:reconcile");
    if (!dbs || generation !== this.generation) return;
    const startedAt = Date.now();
    const result = await reconcileWhiteboardRefs(
      dbs.mainDb,
      dbs.indexDb,
      () =>
        generation !== this.generation || databaseModule.getIndexDatabase(dbName) !== dbs.indexDb
    );
    if (result.processed > 0) {
      log.info(
        `[EntityContext] whiteboard reconcile db=${dbName} processed=${result.processed} changed=${result.changed} aborted=${result.aborted} elapsedMs=${Date.now() - startedAt}`
      );
    }
    if (result.changed > 0) broadcastDatabaseChange(ENTITY_CONTEXT_CHANGED, dbName);
  }

  /** 画布每次保存都会触发写事件；防抖后只对账变化的页，引用集合没变就不通知 */
  private scheduleWhiteboards(dbName: string) {
    clearTimeout(this.whiteboardTimers.get(dbName));
    this.whiteboardTimers.set(
      dbName,
      setTimeout(() => {
        this.whiteboardTimers.delete(dbName);
        // 索引库未就绪（未连接过的库）时跳过，下次连接的对账会补上
        if (!databaseModule.getIndexDatabase(dbName)) return;
        const generation = this.generation;
        this.enqueue(() => this.reconcileWhiteboards(dbName, generation));
      }, DEBOUNCE_MS)
    );
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
    const dbs = await this.databases(dbName, "entity-refs:incremental");
    if (!dbs) return;
    const { changed } = reindexContents(dbs.mainDb, dbs.indexDb, contentIds);
    if (changed > 0) broadcastDatabaseChange(ENTITY_CONTEXT_CHANGED, dbName);
  }

  private async handleGet(
    sender: Electron.WebContents,
    raw: unknown
  ): Promise<EntityContext | null> {
    const input = raw as Partial<EntityRef> | null;
    const kind = normalizeEntityRefKind(input?.kind);
    const id = Number(input?.id);
    if (!kind || !Number.isSafeInteger(id) || id <= 0) throw new Error("实体地址无效");
    const win = BrowserWindow.fromWebContents(sender);
    const dbName = win ? databaseModule.windowToDatabase.get(win.id) : undefined;
    if (!dbName) throw new Error("No database name found");
    const dbs = await this.databases(dbName, "ipc:entity-context");
    if (!dbs) throw new Error("数据库未就绪");
    return getEntityContext(dbs.mainDb, dbs.indexDb, { kind, id });
  }
}

export default new EntityContextModule();
