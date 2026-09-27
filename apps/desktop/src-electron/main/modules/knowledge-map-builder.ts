/**
 * 知识地图的离线构建与增量维护。
 *
 * 什么时候整体重算：
 *  - 从没算过；
 *  - embedding 指纹变了（换了模型，旧向量空间作废）；
 *  - 增量放置累计到一定比例（新卡越来越多地「贴」在旧地图上，主题划分会过时）；
 *  - 用户手动要求。
 * 否则打开图谱直接读库，并顺手对账：库里新增的卡片按语义近邻增量落位、已删除的移出。
 * 不挂在「卡片保存」事件上做：新卡保存时向量还没算（embedding 队列是异步的），
 * 那时放置只能扔到外圈；等到下次打开图谱，向量基本都已就绪。
 *
 * 重算在 worker 线程里跑（700 张约 1 秒、2 万张可能到分钟级），主进程只做读库与写库。
 */

import { join } from "node:path";
import { Worker } from "node:worker_threads";
import type Database from "better-sqlite3";
import { BrowserWindow, ipcMain } from "electron";
import log from "electron-log";
import { placeIncrementally } from "@/knowledge-map/compute";
import type { KnowledgeMap } from "@/knowledge-map/types";
import type { Module } from "../types/module";
import type { KnowledgeMapWorkerResult } from "../workers/knowledge-map.worker";
import databaseModule from "./database";
import KnowledgeMapTable from "./tables/knowledge-map";

const WORKER_PATH = join(__dirname, "knowledge-map-worker.js");
/** 增量放置累计超过地图规模的这个比例，就在下次打开时整体重算 */
const REBUILD_DRIFT_RATIO = 0.15;
const NEIGHBORS = 8;
/**
 * 一次打开最多同步放置这么多张新卡。每张要跑一次 sqlite-vec 近邻查询（真实库约 80ms），
 * 在主进程里做太多会卡住所有窗口的 IPC；超过就改为后台整体重算。
 */
const SYNC_PLACE_LIMIT = 10;

export type KnowledgeMapStatus = "missing" | "stale" | "ready" | "building";

export interface KnowledgeMapPayload {
  status: KnowledgeMapStatus;
  map: KnowledgeMap | null;
}

function runWorker(inputs: ReturnType<typeof KnowledgeMapTable.readInputs>): Promise<KnowledgeMap> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(WORKER_PATH);
    const transfer = inputs.chunks.flatMap(([, buffers]) => buffers);
    worker.once("message", (result: KnowledgeMapWorkerResult) => {
      void worker.terminate();
      if (result.ok) resolve(result.map);
      else reject(new Error(result.message));
    });
    worker.once("error", error => {
      void worker.terminate();
      reject(error);
    });
    worker.postMessage(inputs, transfer);
  });
}

class KnowledgeMapBuilder implements Module {
  name = "knowledge-map-builder";
  /** 每个库同一时间只跑一次重算，重复请求共用 */
  private building = new Map<string, Promise<KnowledgeMap>>();

  async init() {
    ipcMain.handle("knowledge-map:get", (event, options?: { rebuild?: boolean }) =>
      this.handleGet(event.sender, options?.rebuild === true)
    );
    log.info("[KnowledgeMapBuilder] Module initialized");
  }

  private async withDatabases<T>(
    sender: Electron.WebContents,
    run: (mainDb: Database.Database, indexDb: Database.Database, dbName: string) => T | Promise<T>
  ): Promise<T> {
    const win = BrowserWindow.fromWebContents(sender);
    if (!win) throw new Error("No window found");
    const dbName = databaseModule.windowToDatabase.get(win.id);
    if (!dbName) throw new Error("No database name found");
    const mainDb = databaseModule.getDatabase(dbName);
    if (!mainDb) throw new Error("No main database found");
    await databaseModule.ensureIndexDatabaseReady(dbName, "ipc:knowledge-map");
    const indexDb = databaseModule.getIndexDatabase(dbName);
    if (!indexDb) throw new Error("No index database found");
    return run(mainDb, indexDb, dbName);
  }

  private status(
    indexDb: Database.Database,
    dbName: string,
    map: KnowledgeMap | null
  ): KnowledgeMapStatus {
    if (this.building.has(dbName)) return "building";
    if (!map) return "missing";
    if (
      KnowledgeMapTable.storedFingerprint(indexDb) !== KnowledgeMapTable.readFingerprint(indexDb)
    ) {
      return "stale";
    }
    const drift = KnowledgeMapTable.driftCount(indexDb, map.computedAt);
    if (map.nodes.length > 0 && drift / map.nodes.length > REBUILD_DRIFT_RATIO) return "stale";
    return "ready";
  }

  private rebuild(mainDb: Database.Database, indexDb: Database.Database, dbName: string) {
    const pending = this.building.get(dbName);
    if (pending) return pending;
    const startedAt = Date.now();
    const fingerprint = KnowledgeMapTable.readFingerprint(indexDb);
    const inputs = KnowledgeMapTable.readInputs(mainDb, indexDb);
    const task = runWorker(inputs)
      .then(map => {
        // 算的过程中用户可能切了库：连接已换就放弃写入
        if (databaseModule.getIndexDatabase(dbName) !== indexDb) return map;
        KnowledgeMapTable.save(indexDb, map, fingerprint);
        log.info(
          `[KnowledgeMapBuilder] rebuilt db=${dbName} cards=${map.nodes.length} topics=${
            map.topics.filter(t => t.parent === -1).length
          } elapsedMs=${Date.now() - startedAt}`
        );
        return map;
      })
      .finally(() => this.building.delete(dbName));
    this.building.set(dbName, task);
    return task;
  }

  /**
   * 有可用的地图就立即返回（哪怕已过时，并在后台重算）；
   * 完全没有才等这一次重算——首次打开图谱会多等约 1 秒，之后都是秒开。
   */
  private handleGet(sender: Electron.WebContents, force: boolean): Promise<KnowledgeMapPayload> {
    return this.withDatabases(sender, async (mainDb, indexDb, dbName) => {
      let map = KnowledgeMapTable.load(indexDb);
      if (map && !force && !this.building.has(dbName))
        map = this.reconcile(mainDb, indexDb, dbName, map);
      const status = this.status(indexDb, dbName, map);
      if (map && !force) {
        if (status === "stale")
          void this.rebuild(mainDb, indexDb, dbName).catch(error =>
            log.error("[KnowledgeMapBuilder] background rebuild failed:", error)
          );
        return { status, map };
      }
      const fresh = await this.rebuild(mainDb, indexDb, dbName);
      return { status: "ready", map: fresh };
    });
  }

  /**
   * 对账：删掉已不存在的卡片；库里新出现的卡片按语义近邻落位（有向量的才放，
   * 没向量的留给渲染层临时摆放）。新卡太多就交给后台整体重算。
   */
  private reconcile(
    mainDb: Database.Database,
    indexDb: Database.Database,
    dbName: string,
    map: KnowledgeMap
  ): KnowledgeMap {
    const existing = new Set(KnowledgeMapTable.cardIds(mainDb));
    const onMap = new Set(map.nodes.map(node => node.cardId));
    const removed = map.nodes.filter(node => !existing.has(node.cardId));
    const missing = [...existing].filter(
      id => !onMap.has(id) && KnowledgeMapTable.hasVectors(indexDb, id)
    );
    if (removed.length === 0 && missing.length === 0) return map;

    for (const node of removed) KnowledgeMapTable.removeNode(indexDb, node.cardId);
    if (missing.length > SYNC_PLACE_LIMIT) {
      void this.rebuild(mainDb, indexDb, dbName).catch(error =>
        log.error("[KnowledgeMapBuilder] background rebuild failed:", error)
      );
      return KnowledgeMapTable.load(indexDb) ?? map;
    }
    const current = { ...map, nodes: map.nodes.filter(node => existing.has(node.cardId)) };
    for (const cardId of missing) {
      const node = placeIncrementally(current, {
        id: cardId,
        neighbors: KnowledgeMapTable.neighborsOf(indexDb, cardId, NEIGHBORS),
      });
      KnowledgeMapTable.upsertNode(indexDb, node);
      // 后放的卡可以挨着先放的卡（同一批新写的主题）
      current.nodes.push(node);
    }
    log.info(
      `[KnowledgeMapBuilder] reconciled db=${dbName} placed=${missing.length} removed=${removed.length}`
    );
    return current;
  }
}

export default new KnowledgeMapBuilder();
