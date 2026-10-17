/**
 * 模型用量审计模块：全局 usage.db（不进知识库，不随库快照同步），
 * 记录每次模型调用的 token / 费用 / 耗时 / 来源；不存 prompt 与回复原文。
 * 采集点：pi-ai 单发（pi-ai-runtime）与 pi 会话（pi-session-host）。
 */
import { app, ipcMain } from "electron";
import log from "electron-log";
import Database from "better-sqlite3";
import { join } from "node:path";
import { hostname } from "node:os";
import PathUtil from "../../utils/PathUtil";
import databaseModule from "../database";
import userSettingModule from "../user-setting";
import { resolveV2Providers } from "../pi-ai-runtime-core";
import type { Module } from "../../types/module";
import type {
  ModelUsageBreakdownQuery,
  ModelUsageQuery,
  ModelUsageTimeseriesQuery,
  UsageLocalSegments,
  UsageSyncStatus,
} from "@/types/model-usage";
import { ModelUsageStore } from "./store";
import {
  exportSegment,
  importSegment,
  isValidDeviceId,
  localSegments,
  monthRange,
} from "./segments";
import { UsageRecorder, type UsageRecordInput } from "./recorder";
import { ulid } from "./ulid";

const USAGE_DB_FILE = "usage.db";
/** meta 键：已导入的远端分段哈希 synced:<deviceId>/<month> */
const SYNCED_PREFIX = "synced:";
/** meta 键：其它设备的展示名 device_name:<deviceId> */
const DEVICE_NAME_PREFIX = "device_name:";
const syncedKey = (deviceId: string, month: string) => `${SYNCED_PREFIX}${deviceId}/${month}`;

class ModelUsageModule implements Module {
  name = "model-usage";
  private db: Database.Database | null = null;
  private store: ModelUsageStore | null = null;
  private deviceId = "";
  private providerNames = new Map<string, string>();
  private initialized = false;

  readonly recorder = new UsageRecorder({
    getStore: () => this.store,
    getDeviceId: () => this.deviceId,
    getDefaultLibrary: () => databaseModule.getCurrentDatabaseName(),
    getProviderName: providerId => this.providerNames.get(providerId) ?? null,
  });

  async init() {
    if (this.initialized) return;
    this.initialized = true;
    try {
      this.db = new Database(join(PathUtil.getAppDir(), USAGE_DB_FILE));
      this.db.pragma("journal_mode = WAL");
      this.store = new ModelUsageStore(this.db);
      this.deviceId = this.ensureDevice(this.store);
      this.store.recoverInterruptedPluginCalls();
    } catch (error) {
      // 用量库打不开不阻断启动：记录退化为只缓冲、不落库
      log.error("[ModelUsage] open usage.db failed:", error);
      this.store = null;
    }

    const syncProviderNames = (setting: Record<string, unknown> | null | undefined) => {
      this.providerNames = new Map(
        resolveV2Providers(setting).map(provider => [provider.id, provider.name])
      );
    };
    userSettingModule.onSettingChanged(({ newSetting }) => syncProviderNames(newSetting));
    void userSettingModule.getSettingSnapshot().then(syncProviderNames);

    // before-quit 被受控退出拦截后最终走 app.exit，will-quit 不一定触发；两处都兜底
    app.on("before-quit", () => this.recorder.flush());
    process.on("exit", () => this.recorder.flush());

    ipcMain.handle("model-usage:summary", (_event, query: ModelUsageQuery = {}) => {
      this.recorder.flush();
      return this.requireStore().summary(query);
    });
    ipcMain.handle("model-usage:list", (_event, query: ModelUsageQuery = {}) => {
      this.recorder.flush();
      return this.requireStore().list(query);
    });
    ipcMain.handle("model-usage:timeseries", (_event, query: ModelUsageTimeseriesQuery) => {
      this.recorder.flush();
      return this.requireStore().timeseries(query);
    });
    ipcMain.handle("model-usage:breakdown", (_event, query: ModelUsageBreakdownQuery) => {
      this.recorder.flush();
      return this.requireStore().breakdown(query);
    });

    ipcMain.handle("model-usage:plugins", () => this.requireStore().pluginSources());
    this.registerSyncIpc();

    log.info(`[ModelUsage] initialized, device=${this.deviceId || "unavailable"}`);
  }

  /**
   * 跨设备同步：网络在渲染端（同步服务商实现都在那边），主进程只负责分段打包 / 导入 /
   * 设备与同步状态记账。远端 usage/ 布局见 renderer 的 services/usageSync.ts。
   */
  private registerSyncIpc() {
    ipcMain.handle("model-usage:sync-local-segments", (): UsageLocalSegments => {
      this.recorder.flush();
      const store = this.requireStore();
      return {
        deviceId: this.deviceId,
        deviceName: store.getMeta("device_name") ?? hostname(),
        segments: localSegments(store, this.deviceId),
      };
    });
    ipcMain.handle("model-usage:sync-export-segment", (_event, { month }: { month: string }) => {
      this.recorder.flush();
      return exportSegment(this.requireStore(), this.deviceId, month);
    });
    ipcMain.handle(
      "model-usage:sync-import-segment",
      (_event, input: { deviceId: string; month: string; hash: string; data: Uint8Array }) => {
        const store = this.requireStore();
        const result = importSegment(store, input, this.deviceId);
        store.setMeta(syncedKey(input.deviceId, input.month), input.hash);
        return result;
      }
    );
    /** 已导入的远端分段哈希（deviceId → month → hash），据此跳过没变的分段 */
    ipcMain.handle("model-usage:sync-imported", () => {
      const entries = this.requireStore().metaWithPrefix(SYNCED_PREFIX);
      const result: Record<string, Record<string, string>> = {};
      for (const [key, hash] of Object.entries(entries)) {
        const [deviceId, month] = key.slice(SYNCED_PREFIX.length).split("/");
        (result[deviceId] ??= {})[month] = hash;
      }
      return result;
    });
    /** 远端某设备的分段已不存在（被移除或该月被删）：清掉本地副本 */
    ipcMain.handle(
      "model-usage:sync-drop",
      (_event, { deviceId, month }: { deviceId: string; month?: string }) => {
        if (!isValidDeviceId(deviceId) || deviceId === this.deviceId) {
          throw new Error("无效的设备 id");
        }
        const store = this.requireStore();
        if (month) {
          const { from, to } = monthRange(month);
          store.deleteDevice(deviceId, from, to);
          store.deleteMeta(syncedKey(deviceId, month));
        } else {
          store.deleteDevice(deviceId);
          store.deleteMetaWithPrefix(`${SYNCED_PREFIX}${deviceId}/`);
          store.deleteMeta(`${DEVICE_NAME_PREFIX}${deviceId}`);
        }
        return true;
      }
    );
    ipcMain.handle("model-usage:sync-set-device-names", (_event, names: Record<string, string>) => {
      const store = this.requireStore();
      for (const [deviceId, name] of Object.entries(names)) {
        if (isValidDeviceId(deviceId) && typeof name === "string") {
          store.setMeta(`${DEVICE_NAME_PREFIX}${deviceId}`, name.slice(0, 128));
        }
      }
      return true;
    });
    ipcMain.handle("model-usage:sync-set-self-name", (_event, { name }: { name: string }) => {
      const trimmed = typeof name === "string" ? name.trim().slice(0, 128) : "";
      if (!trimmed) throw new Error("设备名不能为空");
      this.requireStore().setMeta("device_name", trimmed);
      return true;
    });
    ipcMain.handle(
      "model-usage:sync-set-result",
      (_event, { ok, error }: { ok: boolean; error?: string }) => {
        const store = this.requireStore();
        if (ok) {
          store.setMeta("sync_last_at", String(Date.now()));
          store.deleteMeta("sync_last_error");
        } else {
          store.setMeta("sync_last_error", (error ?? "同步失败").slice(0, 500));
        }
        return true;
      }
    );
    ipcMain.handle("model-usage:sync-status", (): UsageSyncStatus => {
      this.recorder.flush();
      const store = this.requireStore();
      const names = store.metaWithPrefix(DEVICE_NAME_PREFIX);
      const selfName = store.getMeta("device_name") ?? hostname();
      const stats = new Map(store.deviceStats().map(row => [row.deviceId, row]));
      const ids = new Set([
        this.deviceId,
        ...stats.keys(),
        ...Object.keys(names).map(key => key.slice(DEVICE_NAME_PREFIX.length)),
      ]);
      const lastAt = store.getMeta("sync_last_at");
      return {
        lastSyncedAt: lastAt ? Number(lastAt) : null,
        lastError: store.getMeta("sync_last_error"),
        devices: [...ids]
          .map(deviceId => ({
            deviceId,
            name:
              deviceId === this.deviceId
                ? selfName
                : (names[`${DEVICE_NAME_PREFIX}${deviceId}`] ?? "未命名设备"),
            isSelf: deviceId === this.deviceId,
            events: stats.get(deviceId)?.events ?? 0,
            lastTs: stats.get(deviceId)?.lastTs ?? null,
          }))
          .sort((a, b) => Number(b.isSelf) - Number(a.isSelf) || (b.lastTs ?? 0) - (a.lastTs ?? 0)),
      };
    });
  }

  beginPluginAudit(input: UsageRecordInput): (input: UsageRecordInput) => void {
    const eventId = ulid(input.ts);
    const save = (value: UsageRecordInput) =>
      this.requireStore().replace({
        ...value,
        eventId,
        deviceId: this.deviceId,
        library: value.library ?? null,
        providerName: this.providerNames.get(value.providerId) ?? null,
      });
    save(input);
    return save;
  }

  record(input: UsageRecordInput): void {
    this.recorder.record(input);
  }

  public requireStore(): ModelUsageStore {
    if (!this.store) throw new Error("用量数据库不可用");
    return this.store;
  }

  /** 本机设备标识只存在本机 usage.db，不参与同步 */
  private ensureDevice(store: ModelUsageStore): string {
    const existing = store.getMeta("device_id");
    if (existing) return existing;
    const deviceId = ulid();
    store.setMeta("device_id", deviceId);
    store.setMeta("device_name", hostname());
    return deviceId;
  }
}

export default new ModelUsageModule();
