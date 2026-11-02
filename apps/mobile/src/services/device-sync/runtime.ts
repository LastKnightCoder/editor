import { mobileContentMetrics } from "../../app/plugins/content";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  createNodeDocument,
  bytesToBase64,
  isSafeResource,
  LOCAL_ASSET_PREFIX,
  type ContentNode,
} from "@tau/collaboration";
import { mapNodeResources } from "@tau/db-schema/content-resources";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import { DeviceSyncEngine, synchronizeDevice } from "@tau/collaboration/src/device-sync/engine";
import { prepareDeviceDocument } from "@tau/collaboration/src/device-sync/documents";
import type { DeviceReply, DeviceState } from "@tau/collaboration/src/device-sync/protocol";
import * as Y from "yjs";
import {
  deviceAsset,
  deviceRequest,
  deviceStore,
  nativeDeviceStorage,
  setDeviceSyncDatabase,
  subscribeDeviceSyncWake,
  beginDeviceReplacement,
  deviceReplacementState,
  settleDeviceWrites,
  deviceSyncDatabase,
  wakeDeviceSync,
} from "./native";
import { refreshDeviceContent, resolveDeviceJsonIntents, flushDeviceContent } from "./content";
import { emitDatabaseChange } from "../../hooks/useDatabaseChangeEffect";
import { getQueryClient } from "../../router/query/PageQueryProvider";
import { settleLibraryRequests, drainWithinBudget } from "../ipc-requests";

export interface DeviceSyncStatus {
  phase: "idle" | "syncing" | "synced" | "offline" | "error";
  error?: string;
  lastSync?: number;
  pendingAssets: number;
  preservedCopies: number;
}
let status: DeviceSyncStatus = { phase: "idle", pendingAssets: 0, preservedCopies: 0 };
const listeners = new Set<() => void>();
const activities = new Map<string, Promise<void>>();
async function enterActivity(name: string) {
  const previous = activities.get(name) ?? Promise.resolve();
  let release = () => {};
  const next = new Promise<void>(resolve => {
    release = resolve;
  });
  activities.set(name, next);
  await previous;
  return () => {
    release();
    if (activities.get(name) === next) activities.delete(name);
  };
}
export async function replaceLocalLibrary<T>(name: string, action: () => Promise<T>): Promise<T> {
  const finish = beginDeviceReplacement(name),
    waiting = enterActivity(name);
  let release: (() => void) | undefined;
  try {
    await drainWithinBudget(
      waiting.then(value => {
        release = value;
      })
    );
    await settleDeviceWrites(name);
    await settleLibraryRequests();
    return await action();
  } finally {
    if (release) release();
    else void waiting.then(value => value());
    finish();
    wakeDeviceSync();
  }
}
export async function downloadDeviceLibrary() {
  const name = deviceSyncDatabase();
  if (!name) throw new Error("资料库尚未就绪");
  try {
    publish({ phase: "syncing", error: undefined });
    await replaceLocalLibrary(name, async () => {
      const reply = await deviceRequest<DeviceReply>("download", {});
      await new DeviceSyncEngine(nativeDeviceStorage(name)).replace(reply);
      await getQueryClient().invalidateQueries();
      await emitDatabaseChange({
        reason: "deviceDownload",
        databaseName: name,
        timestamp: Date.now(),
      });
    });
    await synchronizeAssets(name);
    publish({ phase: "synced", error: undefined, lastSync: Date.now(), preservedCopies: 0 });
  } catch (error) {
    publish({ phase: "error", error: String(error) });
    throw error;
  }
}
const publish = (next: Partial<DeviceSyncStatus>) => {
  status = { ...status, ...next };
  for (const listener of listeners) listener();
};
export const getDeviceSyncStatus = () => status;
export const subscribeDeviceSyncStatus = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

async function prepareMissing(name: string) {
  const generation = await deviceStore<string>("generation", {}, name);
  await resolveDeviceJsonIntents(undefined, name);
  for (let batch = 0; batch < 100; batch++) {
    const rows = await deviceStore<
      {
        contentId: number;
        documentId: string;
        content: ContentNode[];
        contracts: ContentContractDictionary;
        revision: string;
      }[]
    >("missing", {}, name);
    if (!rows.length) return;
    await flushDeviceContent();
    for (const row of rows) {
      if (await deviceStore("document", { contentId: row.contentId }, name)) continue;
      const paths: Record<string, string> = {};
      const map = async (nodes: ContentNode[]): Promise<ContentNode[]> =>
        Promise.all(
          nodes.map(async node => {
            if (!Array.isArray(node.children)) return node;
            const replacements = new Map<string, string>();
            mapNodeResources(
              node,
              row.contracts[String(node.tauContract)]?.resources,
              reference => {
                if (!isSafeResource(reference))
                  replacements.set(reference, LOCAL_ASSET_PREFIX + crypto.randomUUID());
                return reference;
              }
            );
            for (const [path, reference] of replacements)
              try {
                paths[reference] = await deviceAsset<string>("import", { path });
              } catch {
                /* 缺图不阻断正文补齐。 */
              }
            return {
              ...mapNodeResources(
                node,
                row.contracts[String(node.tauContract)]?.resources,
                reference => replacements.get(reference) ?? reference
              ),
              children: await map(node.children),
            };
          })
        );
      const doc = await createNodeDocument(
        { documentId: row.documentId, baselineId: crypto.randomUUID(), epoch: 0 },
        { title: "", bannerBg: "", bannerPosition: "center", content: await map(row.content) },
        row.contracts
      );
      try {
        const document = await prepareDeviceDocument({
          contentId: row.contentId,
          documentId: row.documentId,
          baselineId: String(doc.getMap("meta").get("baselineId")),
          epoch: 0,
          state: bytesToBase64(Y.encodeStateAsUpdate(doc)),
          paths,
          updatedAt: Date.now(),
          metricRules: mobileContentMetrics.rules,
        });
        await deviceStore(
          "save-document",
          { document, expectedRevision: row.revision, expectedGeneration: generation },
          name
        );
      } finally {
        doc.destroy();
      }
    }
  }
  throw new Error("DEVICE_SYNC_RETRY: 首次正文准备尚未完成");
}

async function synchronizeAssets(name: string, checked = new Map<string, number>()) {
  let pending = 0;
  for (const asset of await deviceStore<string[]>("assets", {}, name)) {
    if (Date.now() - (checked.get(asset) ?? 0) < 60_000) continue;
    try {
      const local = await deviceAsset<{ exists: boolean }>("has", { name: asset });
      const remote = await deviceRequest<{ exists: boolean }>("asset-has", { name: asset });
      if (local.exists === remote.exists) {
        if (!local.exists) pending++;
        else checked.set(asset, Date.now());
        continue;
      }
      let offset = 0;
      do {
        const chunk = local.exists
          ? await deviceAsset<{ size: number; bytes: string; sha256: string }>("read", {
              name: asset,
              offset,
            })
          : await deviceRequest<{ size: number; bytes: string; sha256: string }>("asset-read", {
              name: asset,
              offset,
            });
        const payload = {
          name: asset,
          offset,
          size: chunk.size,
          bytes: chunk.bytes,
          sha256: chunk.sha256,
        };
        if (local.exists) await deviceRequest("asset-write", payload);
        else await deviceAsset("write", payload);
        offset += 256 * 1024;
        if (offset >= chunk.size) break;
      } while (true);
      checked.set(asset, Date.now());
    } catch {
      pending++;
    }
  }
  publish({ pendingAssets: pending });
}

export async function pairDevice(code: string, deviceName = "我的手机") {
  const started = Date.now();
  let stage = "native-pair";
  console.info(`[device-sync-pair] 开始 code_chars=${code.length}`);
  publish({ phase: "syncing", error: undefined });
  try {
    const paired = await invoke<{
      reply: DeviceReply;
      node: string;
      database: string;
      existing?: boolean;
    }>("device_sync_pair", { code, name: deviceName });
    stage = "validate-reply";
    console.info(
      `[device-sync-pair] 原生配对返回 kind=${paired.reply.kind} existing=${Boolean(paired.existing)} snapshot=${Boolean(paired.reply.snapshot)} documents=${paired.reply.snapshot?.documents.length ?? 0} elapsed_ms=${Date.now() - started}`
    );
    if (!paired.reply.snapshot && !paired.existing)
      throw new Error("DEVICE_SYNC_PAIR: 配对快照不完整");
    const state: DeviceState = {
      ...paired.reply.state,
      node: paired.node,
      ackHead: paired.reply.state.head,
      ackSeq: 0,
      enabled: true,
    };
    stage = "prepare-documents";
    const documents = await Promise.all(
      (paired.reply.snapshot?.documents ?? []).map(prepareDeviceDocument)
    );
    stage = "adopt";
    console.info(`[device-sync-pair] 写入本机副本 documents=${documents.length}`);
    await deviceStore(
      "adopt",
      {
        expectedSequence: 0,
        expectedHead: state.head,
        state,
        snapshot: paired.reply.snapshot,
        documents,
      },
      paired.database
    );
    stage = "switch-database";
    setDeviceSyncDatabase(paired.database);
    await emitDatabaseChange({
      reason: "switch",
      databaseName: paired.database,
      timestamp: Date.now(),
    });
    stage = "sync-assets";
    await synchronizeAssets(paired.database);
    publish({ phase: "synced", lastSync: Date.now(), error: undefined });
    console.info(`[device-sync-pair] 完成 elapsed_ms=${Date.now() - started}`);
    return paired.database;
  } catch (error) {
    console.error(
      `[device-sync-pair] 失败 stage=${stage} elapsed_ms=${Date.now() - started}`,
      String(error)
    );
    publish({ phase: "error", error: String(error) });
    throw error;
  }
}

export function startDeviceSync(name: string) {
  setDeviceSyncDatabase(name);
  const engine = new DeviceSyncEngine(nativeDeviceStorage(name));
  const checkedAssets = new Map<string, number>();
  let foreground = document.visibilityState !== "hidden";
  let disposed = false,
    running = false,
    queued = false,
    failures = 0,
    timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (delay: number) => {
    if (disposed || !foreground || deviceReplacementState(name).active) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      void run();
    }, delay);
  };
  const run = async () => {
    if (disposed || !foreground) return;
    if (running) {
      queued = true;
      return;
    }
    running = true;
    const release = await enterActivity(name);
    try {
      if (disposed || deviceReplacementState(name).active) return;
      const enrolled = await deviceStore<{
        state: DeviceState | null;
        paired: unknown;
        branches?: number;
        noteCopies?: number;
      }>("status", {}, name);
      publish({ preservedCopies: (enrolled.branches ?? 0) + (enrolled.noteCopies ?? 0) });
      if (!enrolled.state && enrolled.paired) {
        const head = await deviceRequest<{ state: DeviceState; sourceSequence: number }>(
          "head",
          {}
        );
        enrolled.state = await deviceStore<DeviceState>("restore-state", head, name);
      }
      if (!enrolled.state || !enrolled.paired) {
        publish({ phase: "idle", error: undefined });
        return;
      }
      publish({ phase: "syncing", error: undefined });
      await prepareMissing(name);
      if (disposed) return;
      const reply = await synchronizeDevice(engine, offer => {
        if (deviceReplacementState(name).active)
          throw new Error("DEVICE_SYNC_REPLACED: 当前库正在恢复");
        return deviceRequest<DeviceReply>("sync", { offer });
      });
      if (disposed) return;
      await refreshDeviceContent();
      await synchronizeAssets(name, checkedAssets);
      failures = 0;
      publish({ phase: "synced", lastSync: Date.now(), error: undefined });
      if (reply.snapshot || reply.changes.length || reply.documents.length) {
        void getQueryClient().invalidateQueries({
          predicate: query =>
            !["settings", "plugins", "models", "tts", "sync", "upload", "collaboration"].includes(
              String(query.queryKey[0])
            ),
        });
        await emitDatabaseChange({
          reason: "deviceSync",
          databaseName: name,
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      failures++;
      const message = String(error);
      publish({ phase: message.includes("OFFLINE") ? "offline" : "error", error: message });
    } finally {
      release();
      running = false;
      if (!disposed) {
        const delay = queued
          ? 100
          : failures
            ? Math.min(60_000, 2000 * 2 ** Math.min(failures - 1, 5))
            : 1000;
        queued = false;
        schedule(delay);
      }
    }
  };
  const wake = () => {
    failures = 0;
    if (running) queued = true;
    else schedule(50);
  };
  const resume = () => {
    foreground = document.visibilityState !== "hidden";
    if (foreground) {
      checkedAssets.clear();
      wake();
    } else hide();
  };
  const stopWake = subscribeDeviceSyncWake(wake);
  let stopResume: (() => void) | undefined;
  const nativeResume = () => {
    foreground = true;
    checkedAssets.clear();
    wake();
  };
  void listen("device-sync-resume", nativeResume)
    .then(stop => {
      if (disposed) stop();
      else stopResume = stop;
    })
    .catch(() => {});
  const hide = () => {
    foreground = false;
    clearTimeout(timer);
    void flushDeviceContent().catch(error => publish({ phase: "error", error: String(error) }));
  };
  window.addEventListener("pagehide", hide);
  window.addEventListener("online", wake);
  window.addEventListener("pageshow", nativeResume);
  document.addEventListener("visibilitychange", resume);
  schedule(0);
  return () => {
    disposed = true;
    clearTimeout(timer);
    stopWake();
    stopResume?.();
    window.removeEventListener("pagehide", hide);
    window.removeEventListener("online", wake);
    window.removeEventListener("pageshow", nativeResume);
    document.removeEventListener("visibilitychange", resume);
  };
}
