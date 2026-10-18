import { ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, pathExists } from "fs-extra/esm";

import BackendWebSocketServer from "../utils/BackendWebSocketServer";
import PathUtil from "../utils/PathUtil";
import log from "electron-log";
import {
  IRateLimitConfig,
  RATE_LIMIT_CONFIGS,
  IResourceSyncProgress,
  IFileSyncStatus,
  ISyncStatusFile,
  ResourceSyncStatus,
  ResourceSyncOptions,
  ResourceSyncProvider,
} from "@/types/resource-sync";
import { IRemoteFileInfo } from "@/types/sync";
import databaseModule from "./database";
import { pluginSyncSessions } from "../services/plugin-sync";
import { copyJson } from "@tau/plugins/host";
import { pluginSyncStatusFile } from "../services/plugin-sync-status";

interface SyncTask {
  name: string;
  direction: "upload" | "download";
  localPath: string;
  remotePath: string;
  size: number;
}

interface StatusFileMeta {
  path: string;
  file: ISyncStatusFile;
}

const RESOURCE_PREFIX = "resources";
const STATUS_DIR_NAME = "sync-status";

const sleep = (ms: number) =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

class RateLimitedExecutor {
  private config: IRateLimitConfig;
  private runningCount = 0;
  private lastRequestTime = 0;

  constructor(config: IRateLimitConfig) {
    this.config = config;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.waitForSlot();
    await this.waitForRateLimit();
    return this.executeWithRetry(fn);
  }

  private async waitForSlot() {
    while (this.runningCount >= this.config.maxConcurrent) {
      await sleep(50);
    }
  }

  private async waitForRateLimit() {
    if (!this.config.requestsPerSecond || this.config.requestsPerSecond <= 0) {
      return;
    }
    const interval = 1000 / this.config.requestsPerSecond;
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < interval) {
      await sleep(interval - elapsed);
    }
    this.lastRequestTime = Date.now();
  }

  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;
    for (let i = 0; i <= this.config.retryCount; i++) {
      try {
        this.runningCount++;
        return await fn();
      } catch (error) {
        lastError = error as Error;
        if (lastError.name === "AbortError") throw error;
        if (i < this.config.retryCount) {
          const delay = this.config.retryDelayMs * Math.pow(this.config.retryBackoffMultiplier, i);
          await sleep(delay);
        }
      } finally {
        this.runningCount--;
      }
    }
    throw lastError || new Error("未知错误");
  }
}

interface ProviderAdapter {
  dispose?(): Promise<void>;
  list(prefix: string): Promise<IRemoteFileInfo[]>;
  upload(objectName: string, content: Buffer): Promise<void>;
  download(objectName: string): Promise<Buffer>;
}

class PluginResourceAdapter implements ProviderAdapter {
  constructor(
    private readonly session: string,
    private readonly owner: number,
    private readonly onAbort: () => void
  ) {}
  private async call(method: Parameters<typeof pluginSyncSessions.call>[2], args: unknown[]) {
    try {
      return await pluginSyncSessions.call(this.owner, this.session, method, args);
    } catch (error) {
      if ((error as Error).name === "AbortError") this.onAbort();
      throw error;
    }
  }
  list(prefix: string) {
    return this.call("listFiles", [prefix]) as Promise<IRemoteFileInfo[]>;
  }
  async upload(name: string, content: Buffer) {
    if (!(await this.call("uploadFile", [name, content]))) throw new Error("资源文件上传失败");
  }
  async download(name: string) {
    return Buffer.from((await this.call("downloadFile", [name])) as Uint8Array);
  }
  dispose() {
    return pluginSyncSessions.end(this.owner, this.session);
  }
}

class ResourceSyncModule {
  private backendServer: BackendWebSocketServer | null = null;
  private adapter: ProviderAdapter | null = null;
  private statuses: Record<string, IFileSyncStatus> = {};
  private statusMeta: StatusFileMeta | null = null;
  private running = false;
  private cancelRequested = false;
  private progress: IResourceSyncProgress = this.createEmptyProgress();
  private lastOptions: ResourceSyncOptions | null = null;
  private executor: RateLimitedExecutor | null = null;

  async init(backendServer: BackendWebSocketServer) {
    this.backendServer = backendServer;
    this.registerIpcHandlers();
  }

  private createEmptyProgress(): IResourceSyncProgress {
    return {
      totalFiles: 0,
      processedFiles: 0,
      currentFile: null,
      status: "idle",
      uploadCount: 0,
      downloadCount: 0,
      skippedCount: 0,
      errorCount: 0,
      startTime: null,
    };
  }

  private registerIpcHandlers() {
    ipcMain.handle("resource-sync:start", async (event, options) => {
      return await this.startSync(options as ResourceSyncOptions, event.sender.id);
    });

    ipcMain.handle("resource-sync:resume", async (event, options) => {
      const payload = (options as ResourceSyncOptions) || this.lastOptions;
      if (!payload) return { ok: false, message: "缺少同步配置" };
      return await this.startSync(payload, event.sender.id);
    });

    ipcMain.handle("resource-sync:retry-failed", async (event, options) => {
      const payload = (options as ResourceSyncOptions) || this.lastOptions;
      if (!payload) return { ok: false, message: "缺少同步配置" };
      return await this.startSync(payload, event.sender.id, { retryFailedOnly: true });
    });

    ipcMain.handle("resource-sync:cancel", async () => {
      this.cancelRequested = true;
      return { ok: true };
    });

    ipcMain.handle("resource-sync:get-progress", async () => {
      return this.progress;
    });

    ipcMain.handle("resource-sync:get-statuses", async () => {
      return this.statusMeta?.file || null;
    });

    ipcMain.handle("resource-sync:list-local-files", async () => {
      const directory = path.join(PathUtil.getAppDir(), RESOURCE_PREFIX);
      await ensureDir(directory);
      return this.scanLocalFiles(directory);
    });

    ipcMain.handle("resource-sync:refresh", async (event, options) => {
      try {
        const payload = (options as ResourceSyncOptions) || this.lastOptions;
        if (!payload) {
          throw new Error("缺少同步配置");
        }
        if (this.running) {
          throw new Error("资源同步正在进行中，无法刷新");
        }
        const status = await this.refreshStatus(payload, event.sender.id);
        return status;
      } catch (error) {
        log.error("[resource-sync] refresh failed", error);
        throw error;
      }
    });
  }

  private getRateLimitConfig(provider: ResourceSyncProvider, override?: Partial<IRateLimitConfig>) {
    const base = RATE_LIMIT_CONFIGS[provider] || RATE_LIMIT_CONFIGS.plugin;
    const merged = {
      ...base,
      ...override,
    };
    merged.maxConcurrent = Math.min(merged.maxConcurrent, 3);
    return merged;
  }

  private async createAdapter(options: ResourceSyncOptions, owner: number) {
    switch (options.provider) {
      case "plugin":
        return new PluginResourceAdapter(
          await pluginSyncSessions.begin(owner, options.pluginId, copyJson(options.config)),
          owner,
          () => {
            this.cancelRequested = true;
          }
        );
      default:
        throw new Error("不支持的同步提供者");
    }
  }

  private async startSync(
    options: ResourceSyncOptions,
    owner: number,
    flags?: { retryFailedOnly?: boolean }
  ) {
    if (this.running) {
      return { ok: false, message: "资源同步正在进行中" };
    }
    this.running = true;
    this.cancelRequested = false;
    this.progress = this.createEmptyProgress();
    this.progress.status = "scanning";
    this.progress.startTime = Date.now();
    this.lastOptions = options;

    try {
      log.info("[resource-sync] start", {
        provider: options.provider,
      });
      this.adapter = await this.createAdapter(options, owner);
      const statusMeta = await this.prepareStatusFile(options);
      this.statusMeta = statusMeta;
      this.statuses = { ...statusMeta.file.files };

      const blacklist = this.getResourceBlacklist();
      let retryTargets: Set<string> | null = null;
      if (flags?.retryFailedOnly) {
        retryTargets = this.markErrorsPending();
        if (blacklist.size && retryTargets?.size) {
          blacklist.forEach(name => retryTargets?.delete(name));
        }
      }

      const plan = await this.buildPlan(this.adapter, retryTargets, blacklist);
      if (this.cancelRequested) {
        this.progress.status = "cancelled";
        this.notifyProgress();
        return { ok: false, message: "同步已取消" };
      }
      log.info("[resource-sync] plan built", {
        total: plan.tasks.length,
        uploads: plan.tasks.filter(t => t.direction === "upload").length,
        downloads: plan.tasks.filter(t => t.direction === "download").length,
      });
      await this.saveStatusFile();

      if (plan.tasks.length === 0) {
        this.progress.status = this.progress.errorCount > 0 ? "error" : "completed";
        this.notifyProgress();
        if (this.progress.status === "completed") {
          this.sendCompletion();
        } else {
          this.sendErrorNotification("部分资源同步失败");
        }
        return {
          ok: this.progress.status === "completed",
          message: flags?.retryFailedOnly ? "没有需要重试的文件" : "没有需要同步的文件",
        };
      }

      this.progress.status = "syncing";
      this.notifyProgress();

      this.executor = new RateLimitedExecutor(
        this.getRateLimitConfig(options.provider, options.rateLimit)
      );

      await this.executeTasks(plan.tasks);

      if (this.cancelRequested) {
        this.progress.status = "cancelled";
      } else if (this.progress.errorCount > 0) {
        this.progress.status = "error";
      } else {
        this.progress.status = "completed";
        if (this.statusMeta) {
          this.statusMeta.file.lastSyncTime = Date.now();
        }
      }

      await this.saveStatusFile();
      this.notifyProgress();

      if (this.progress.status === "completed") {
        this.sendCompletion();
      } else if (this.progress.status === "error") {
        this.sendErrorNotification("部分资源同步失败");
      }

      return { ok: true };
    } catch (error) {
      log.error("[resource-sync] failed", error);
      this.progress.status = "error";
      const message = (error as Error).message || "资源同步失败";
      this.sendErrorNotification(message);
      return { ok: false, message };
    } finally {
      try {
        await this.adapter?.dispose?.();
      } finally {
        this.adapter = null;
        this.running = false;
        this.progress.currentFile = null;
      }
    }
  }

  private async refreshStatus(options: ResourceSyncOptions, owner: number) {
    if (this.running) throw new Error("资源同步或刷新正在进行中");
    this.running = true;
    let adapter: ProviderAdapter | null = null;
    try {
      try {
        adapter = await this.createAdapter(options, owner);
      } catch (error) {
        log.warn("[resource-sync] refresh create adapter failed, use local only", error);
        adapter = null;
      }
      const statusMeta = await this.prepareStatusFile(options);
      this.statusMeta = statusMeta;
      this.statuses = { ...statusMeta.file.files };
      const blacklist = this.getResourceBlacklist();
      const plan = await this.buildPlan(adapter, null, blacklist);

      this.progress.status = "idle";
      this.progress.currentFile = null;
      this.progress.startTime = null;

      await this.saveStatusFile();
      this.notifyProgress();
      log.info("[resource-sync] refresh completed", {
        total: plan.tasks.length,
        upload: plan.tasks.filter(t => t.direction === "upload").length,
        download: plan.tasks.filter(t => t.direction === "download").length,
        adapterReady: !!adapter,
      });
      return this.statusMeta?.file || null;
    } finally {
      try {
        await adapter?.dispose?.();
      } finally {
        this.running = false;
      }
    }
  }

  private markErrorsPending() {
    const retryTargets = new Set<string>();
    Object.keys(this.statuses).forEach(name => {
      const status = this.statuses[name];
      if (status.syncStatus === ResourceSyncStatus.Error) {
        this.statuses[name] = {
          ...status,
          syncStatus: ResourceSyncStatus.Pending,
          errorMessage: null,
        };
        retryTargets.add(name);
      } else if (status.syncStatus === ResourceSyncStatus.Syncing) {
        this.statuses[name] = {
          ...status,
          syncStatus: ResourceSyncStatus.Pending,
        };
        retryTargets.add(name);
      }
    });
    return retryTargets;
  }

  private getResourceBlacklist() {
    const db = databaseModule.getCurrentDatabase();
    if (!db) return new Set<string>();
    try {
      const rows = db.prepare("SELECT file_name FROM resource_sync_blacklist").all() as Array<{
        file_name: string;
      }>;
      return new Set(rows.map(row => row.file_name));
    } catch (error) {
      log.error("[resource-sync] load blacklist failed", error);
      return new Set<string>();
    }
  }

  private async prepareStatusFile(options: ResourceSyncOptions): Promise<StatusFileMeta> {
    const statusDir = path.join(PathUtil.getAppDir(), STATUS_DIR_NAME);
    await ensureDir(statusDir);
    const statusInfo = this.getStatusFileName(options);
    const { fileName, config } = statusInfo;
    const statusPath = path.join(statusDir, fileName);
    let statusFile: ISyncStatusFile = {
      provider: options.provider,
      config: this.ensureConfigStrings(config),
      lastSyncTime: null,
      files: {},
    };

    if (await pathExists(statusPath)) {
      try {
        const content = await fs.readFile(statusPath, "utf-8");
        const parsed = JSON.parse(content) as ISyncStatusFile;
        statusFile = {
          provider: options.provider,
          config: this.ensureConfigStrings(config),
          lastSyncTime: parsed.lastSyncTime || null,
          files: parsed.files || {},
        };
      } catch {
        // ignore broken cache
      }
    }

    Object.keys(statusFile.files).forEach(name => {
      const status = statusFile.files[name];
      if (status.syncStatus === ResourceSyncStatus.Syncing) {
        statusFile.files[name] = {
          ...status,
          syncStatus: ResourceSyncStatus.Pending,
        };
      }
      if (typeof status.retryCount !== "number") {
        statusFile.files[name].retryCount = 0;
      }
    });

    return { path: statusPath, file: statusFile };
  }

  private getStatusFileName(options: ResourceSyncOptions) {
    switch (options.provider) {
      case "plugin":
        return {
          fileName: pluginSyncStatusFile(options.pluginId, options.config),
          config: { pluginId: options.pluginId },
        };
      default:
        return {
          fileName: "resource-sync.json",
          config: {},
        };
    }
  }

  // 使用 any 规避复杂配置类型映射带来的 TS 推断问题
  private ensureConfigStrings(config: any): Record<string, string> {
    const result: Record<string, string> = {};
    Object.entries(config || {}).forEach(([k, v]) => {
      result[k] = typeof v === "undefined" ? "" : String(v);
    });
    return result;
  }

  private async buildPlan(
    adapter: ProviderAdapter | null,
    retryTargets?: Set<string> | null,
    blacklist?: Set<string> | null
  ) {
    if (!adapter) {
      log.warn(
        "[resource-sync] buildPlan without remote adapter, only local files will be considered"
      );
    }
    const resourcesDir = path.join(PathUtil.getAppDir(), RESOURCE_PREFIX);
    await ensureDir(resourcesDir);

    const localFiles = await this.scanLocalFiles(resourcesDir);
    let remoteFiles: IRemoteFileInfo[] = [];
    if (adapter) {
      try {
        remoteFiles = await adapter.list(`${RESOURCE_PREFIX}/`);
      } catch (error) {
        log.warn("[resource-sync] list remote files failed, fallback to local only", error);
        remoteFiles = [];
      }
    }
    const remoteMap = new Map<string, IRemoteFileInfo>(remoteFiles.map(item => [item.name, item]));

    const newStatuses: Record<string, IFileSyncStatus> = {};
    const tasks: SyncTask[] = [];
    const limitToRetry = !!retryTargets;
    const blacklistSet = blacklist ?? new Set<string>();
    let skippedCount = 0;

    for (const local of localFiles) {
      if (blacklistSet.has(local.name)) {
        remoteMap.delete(local.name);
        continue;
      }
      const remote = remoteMap.get(local.name);
      if (remote) {
        remoteMap.delete(local.name);
        newStatuses[local.name] = {
          syncStatus: ResourceSyncStatus.Synced,
          syncDirection: null,
          fileSize: local.size,
          lastSyncTime: this.statuses[local.name]?.lastSyncTime || Date.now(),
          errorMessage: null,
          retryCount: this.statuses[local.name]?.retryCount || 0,
        };
        skippedCount++;
        continue;
      }

      const existing = this.statuses[local.name];
      const status = this.initStatus(existing, "upload", local.size);
      newStatuses[local.name] = status;
      if (
        status.syncStatus === ResourceSyncStatus.Pending &&
        (!limitToRetry || retryTargets?.has(local.name))
      ) {
        tasks.push({
          name: local.name,
          direction: "upload",
          localPath: local.path,
          remotePath: `${RESOURCE_PREFIX}/${local.name}`,
          size: local.size,
        });
      }
    }

    remoteMap.forEach((remote, name) => {
      if (blacklistSet.has(name)) {
        return;
      }
      const existing = this.statuses[name];
      const status = this.initStatus(existing, "download", remote.size || 0);
      newStatuses[name] = status;
      if (
        status.syncStatus === ResourceSyncStatus.Pending &&
        (!limitToRetry || retryTargets?.has(name))
      ) {
        tasks.push({
          name,
          direction: "download",
          localPath: path.join(resourcesDir, name),
          remotePath: remote.path || `${RESOURCE_PREFIX}/${name}`,
          size: remote.size || 0,
        });
      }
    });

    this.statuses = newStatuses;
    this.recalculateProgress(skippedCount);
    return { tasks };
  }

  private initStatus(
    existing: IFileSyncStatus | undefined,
    direction: "upload" | "download",
    size: number
  ): IFileSyncStatus {
    const status: IFileSyncStatus = existing
      ? { ...existing }
      : {
          syncStatus: ResourceSyncStatus.Pending,
          syncDirection: direction,
          fileSize: size,
          lastSyncTime: null,
          errorMessage: null,
          retryCount: 0,
        };
    status.syncDirection = direction;
    status.fileSize = size;
    if (status.syncStatus !== ResourceSyncStatus.Error) {
      status.syncStatus = ResourceSyncStatus.Pending;
      status.errorMessage = null;
    }
    return status;
  }

  private async scanLocalFiles(baseDir: string) {
    const entries = await fs.readdir(baseDir, { withFileTypes: true });
    const files: Array<{ name: string; path: string; size: number }> = [];

    for (const entry of entries) {
      if (entry.isFile()) {
        const fullPath = path.join(baseDir, entry.name);
        const stat = await fs.stat(fullPath);
        files.push({
          name: entry.name,
          path: fullPath,
          size: stat.size,
        });
      }
    }

    return files;
  }

  private recalculateProgress(skippedCount?: number) {
    const statuses = Object.values(this.statuses);
    this.progress.totalFiles = statuses.length;
    this.progress.uploadCount = statuses.filter(s => s.syncDirection === "upload").length;
    this.progress.downloadCount = statuses.filter(s => s.syncDirection === "download").length;
    this.progress.skippedCount =
      skippedCount !== undefined
        ? skippedCount
        : statuses.filter(s => s.syncDirection === null).length;
    this.progress.errorCount = statuses.filter(
      s => s.syncStatus === ResourceSyncStatus.Error
    ).length;
    this.progress.processedFiles = statuses.filter(
      s => s.syncStatus === ResourceSyncStatus.Synced || s.syncStatus === ResourceSyncStatus.Error
    ).length;
  }

  private async executeTasks(tasks: SyncTask[]) {
    if (!this.executor || !this.adapter) return;
    const promises = tasks.map(task => this.executor!.execute(() => this.runTask(task)));
    await Promise.allSettled(promises);
  }

  private async runTask(task: SyncTask) {
    if (!this.adapter) return;
    if (this.cancelRequested) return;

    this.statuses[task.name] = {
      ...(this.statuses[task.name] || this.initStatus(undefined, task.direction, task.size)),
      syncStatus: ResourceSyncStatus.Syncing,
      errorMessage: null,
    };
    this.progress.currentFile = task.name;
    this.notifyFileStatus(task.name);
    this.notifyProgress();

    try {
      if (task.direction === "upload") {
        const content = await fs.readFile(task.localPath);
        if (this.cancelRequested) return;
        await this.adapter.upload(task.remotePath, content);
      } else {
        const content = await this.adapter.download(task.remotePath);
        if (this.cancelRequested) return;
        await ensureDir(path.dirname(task.localPath));
        await fs.writeFile(task.localPath, content);
      }
      this.statuses[task.name] = {
        ...(this.statuses[task.name] || this.initStatus(undefined, task.direction, task.size)),
        syncStatus: ResourceSyncStatus.Synced,
        lastSyncTime: Date.now(),
        errorMessage: null,
        retryCount: 0,
      };
    } catch (error) {
      log.error("[resource-sync] task failed", {
        name: task.name,
        direction: task.direction,
        error,
      });
      if (this.cancelRequested) return;
      const previous = this.statuses[task.name];
      this.statuses[task.name] = {
        ...(previous || this.initStatus(undefined, task.direction, task.size)),
        syncStatus: ResourceSyncStatus.Error,
        errorMessage: (error as Error).message || "同步失败",
        retryCount: (previous?.retryCount || 0) + 1,
      };
    } finally {
      if (this.cancelRequested) {
        const current = this.statuses[task.name];
        if (current && current.syncStatus === ResourceSyncStatus.Syncing) {
          this.statuses[task.name] = {
            ...current,
            syncStatus: ResourceSyncStatus.Pending,
            errorMessage: null,
          };
        }
      }
      this.progress.currentFile = null;
      this.recalculateProgress();
      await this.saveStatusFile();
      this.notifyFileStatus(task.name);
      this.notifyProgress();
    }
  }

  private async saveStatusFile() {
    if (!this.statusMeta) return;
    const content: ISyncStatusFile = {
      ...this.statusMeta.file,
      files: this.statuses,
    };
    await fs.writeFile(this.statusMeta.path, JSON.stringify(content, null, 2), "utf-8");
    this.statusMeta.file = content;
  }

  private notifyProgress() {
    if (!this.backendServer) return;
    this.backendServer.sendNotification("resource-sync:progress-update", {
      progress: this.progress,
    });
  }

  private notifyFileStatus(name: string) {
    if (!this.backendServer) return;
    this.backendServer.sendNotification("resource-sync:file-status-changed", {
      name,
      status: this.statuses[name],
    });
  }

  private sendCompletion() {
    if (!this.backendServer) return;
    this.backendServer.sendNotification("resource-sync:completed", {
      progress: this.progress,
    });
  }

  private sendErrorNotification(message: string) {
    if (!this.backendServer) return;
    this.backendServer.sendNotification("resource-sync:error", {
      message,
      progress: this.progress,
    });
  }
}

export default new ResourceSyncModule();
