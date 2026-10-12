/**
 * 知识地图的离线构建与增量维护。
 *
 * 什么时候整体重算：
 *  - 从没算过；
 *  - embedding 指纹变了（换了模型，旧向量空间作废）；
 *  - 增量放置与编辑累计到一定比例（新卡越来越多地「贴」在旧地图上、旧卡的内容与 tag
 *    改了而主题名还是旧的，主题划分会过时）；
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
import {
  REBUILD_DRIFT_RATIO,
  syncPlaceLimit,
  WAIT_FIRST_BUILD_CARDS,
} from "@/knowledge-map/schedule";
import type { KnowledgeMap, KnowledgeMapItem } from "@/knowledge-map/types";
import type { Module } from "../types/module";
import type { KnowledgeMapWorkerResult } from "../workers/knowledge-map.worker";
import databaseModule from "./database";
import KnowledgeMapTable from "./tables/knowledge-map";
import { recordIpcCall } from "./perf-record";

const WORKER_PATH = join(__dirname, "knowledge-map-worker.js");
const NEIGHBORS = 8;

export type KnowledgeMapStatus = "missing" | "stale" | "ready" | "building";

export interface KnowledgeMapPayload {
  status: KnowledgeMapStatus;
  map: KnowledgeMap | null;
  /** 节点的展示信息；地图还没算出来时也有，渲染层据此先画链接图谱 */
  items: KnowledgeMapItem[];
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
    ipcMain.handle("knowledge-map:get", async (event, options?: { rebuild?: boolean }) => {
      const startedAt = performance.now();
      try {
        const result = await this.handleGet(event.sender, options?.rebuild === true);
        recordIpcCall("knowledge-map:get", performance.now() - startedAt, true);
        return result;
      } catch (error) {
        recordIpcCall("knowledge-map:get", performance.now() - startedAt, false);
        throw error;
      }
    });
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
    mainDb: Database.Database,
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
    // 漂移 = 增量放置 ∪ 编辑过的节点（按行时间戳算，重启后仍准）
    const drift = KnowledgeMapTable.driftCount(
      KnowledgeMapTable.listEntities(mainDb),
      indexDb,
      map.computedAt
    );
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
          `[KnowledgeMapBuilder] rebuilt db=${dbName} nodes=${map.nodes.length} topics=${
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
   * 有可用的地图就立即返回（哪怕已过时，并在后台重算）。
   *
   * 完全没有时也不干等：万级库的首次重算是分钟级的（压测：2 万张约 4 分钟），
   * 干等意味着几分钟的空白 Loading。改为立刻回 `building` + 空地图，渲染层退回
   * 链接图谱先让用户能看能点；算完由 `knowledge-map:updated` 推给窗口换上。
   * 小库（约 700 张，1 秒）等一下反而更好——省掉「链接图谱闪一下再换成地图」，
   * 所以按库里的卡片数分流。
   */
  private handleGet(sender: Electron.WebContents, force: boolean): Promise<KnowledgeMapPayload> {
    return this.withDatabases(sender, async (mainDb, indexDb, dbName) => {
      let map = KnowledgeMapTable.load(indexDb);
      if (map && !force && !this.building.has(dbName))
        map = this.reconcile(mainDb, indexDb, dbName, map);
      const status = this.status(mainDb, indexDb, dbName, map);
      const items = KnowledgeMapTable.listItems(mainDb, indexDb);
      if (map && !force) {
        if (status === "stale")
          void this.rebuild(mainDb, indexDb, dbName).catch(error =>
            log.error("[KnowledgeMapBuilder] background rebuild failed:", error)
          );
        return { status, map, items };
      }
      const task = this.rebuild(mainDb, indexDb, dbName);
      if (!force && KnowledgeMapTable.listEntities(mainDb).length > WAIT_FIRST_BUILD_CARDS) {
        // 不 await：渲染层拿到 building 后退回链接图谱，并轮询等这次算完
        task.catch(error => log.error("[KnowledgeMapBuilder] first build failed:", error));
        return { status: "building", map: null, items };
      }
      const fresh = await task;
      return { status: "ready", map: fresh, items };
    });
  }

  /**
   * 后台用（主题洞见）：对账，地图没有或过时就整体重算并等它算完。
   * 地图平时只在打开地图页时更新，主题洞见读的主题划分不能比内容旧太多。库未就绪返回 null。
   */
  async ensureFresh(dbName: string): Promise<KnowledgeMap | null> {
    const mainDb = databaseModule.getDatabase(dbName);
    if (!mainDb?.open) return null;
    await databaseModule.ensureIndexDatabaseReady(dbName, "knowledge-map:ensure-fresh");
    const indexDb = databaseModule.getIndexDatabase(dbName);
    if (!indexDb) return null;
    const pending = this.building.get(dbName);
    if (pending) return pending;
    let map = KnowledgeMapTable.load(indexDb);
    if (map) map = this.reconcile(mainDb, indexDb, dbName, map);
    const status = this.status(mainDb, indexDb, dbName, map);
    if (status === "building") return this.building.get(dbName) ?? map;
    if (!map || status === "stale") return this.rebuild(mainDb, indexDb, dbName);
    return map;
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
    const entities = KnowledgeMapTable.listEntities(mainDb);
    const existing = new Map(entities.map(entity => [entity.key, entity]));
    const onMap = new Set(map.nodes.map(node => node.key));
    const removed = map.nodes.filter(node => !existing.has(node.key));
    const missing = entities.filter(
      entity => !onMap.has(entity.key) && KnowledgeMapTable.hasVectors(indexDb, entity.key)
    );
    if (removed.length === 0 && missing.length === 0) return map;

    for (const node of removed) KnowledgeMapTable.removeNode(indexDb, node.key);
    if (missing.length > syncPlaceLimit(map.nodes.length)) {
      void this.rebuild(mainDb, indexDb, dbName).catch(error =>
        log.error("[KnowledgeMapBuilder] background rebuild failed:", error)
      );
      return KnowledgeMapTable.load(indexDb) ?? map;
    }
    const current = { ...map, nodes: map.nodes.filter(node => existing.has(node.key)) };
    for (const entity of missing) {
      const node = placeIncrementally(current, {
        key: entity.key,
        seed: entity.id,
        neighbors: KnowledgeMapTable.neighborsOf(indexDb, entity.key, NEIGHBORS),
      });
      KnowledgeMapTable.upsertNode(indexDb, node);
      // 后放的节点可以挨着先放的（同一批新写的主题）
      current.nodes.push(node);
    }
    log.info(
      `[KnowledgeMapBuilder] reconciled db=${dbName} placed=${missing.length} removed=${removed.length}`
    );
    return current;
  }
}

export default new KnowledgeMapBuilder();
