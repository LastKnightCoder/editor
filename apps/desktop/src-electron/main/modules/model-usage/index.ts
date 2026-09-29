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
import type { ModelUsageQuery } from "@/types/model-usage";
import { ModelUsageStore } from "./store";
import { UsageRecorder, type UsageRecordInput } from "./recorder";
import { ulid } from "./ulid";

const USAGE_DB_FILE = "usage.db";

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

    log.info(`[ModelUsage] initialized, device=${this.deviceId || "unavailable"}`);
  }

  record(input: UsageRecordInput): void {
    this.recorder.record(input);
  }

  private requireStore(): ModelUsageStore {
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
