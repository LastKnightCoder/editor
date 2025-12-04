import { ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { ensureDir, pathExists } from "fs-extra/esm";
import OSS from "ali-oss";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { createClient } from "webdav";

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
  AliossResourceSyncOptions,
  S3ResourceSyncOptions,
  WebDavResourceSyncOptions,
  GithubResourceSyncOptions,
} from "@/types/resource-sync";
import { IRemoteFileInfo } from "@/types/sync";
import {
  downloadFileFromGithub,
  listGithubFiles,
  uploadFileToGithub,
} from "@/utils/github";
import databaseModule from "./database";

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
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const streamToBuffer = async (body: any): Promise<Buffer> => {
  if (!body) return Buffer.alloc(0);
  if (body instanceof Uint8Array || Buffer.isBuffer(body)) {
    return Buffer.from(body);
  }
  if (typeof body.arrayBuffer === "function") {
    const arrayBuffer = await body.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  return await new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    body.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    body.on("error", reject);
    body.on("end", () => resolve(Buffer.concat(chunks)));
  });
};

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
        if (i < this.config.retryCount) {
          const delay =
            this.config.retryDelayMs *
            Math.pow(this.config.retryBackoffMultiplier, i);
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
  list(prefix: string): Promise<IRemoteFileInfo[]>;
  upload(objectName: string, content: Buffer): Promise<void>;
  download(objectName: string): Promise<Buffer>;
}

class AliossAdapter implements ProviderAdapter {
  private client: OSS;
  private basePath: string;
  constructor(options: AliossResourceSyncOptions) {
    this.client = new OSS({
      accessKeyId: options.accessKeyId,
      accessKeySecret: options.accessKeySecret,
      bucket: options.bucket,
      region: options.region,
    });
    this.basePath = options.path || "";
  }

  async list(prefix: string): Promise<IRemoteFileInfo[]> {
    const fullPrefix = this.buildKey(prefix);
    const files: IRemoteFileInfo[] = [];
    let marker: string | undefined;
    do {
      const res = await this.client.list(
        {
          prefix: fullPrefix || undefined,
          marker,
          "max-keys": 1000,
        },
        {},
      );
      const objects = res.objects || [];
      objects.forEach((obj: any) => {
        if (!obj.name || String(obj.name).endsWith("/")) return;
        const relativePath = this.stripBase(obj.name);
        files.push({
          name:
            relativePath.split("/").filter(Boolean).pop() || relativePath || "",
          path: relativePath,
          size: obj.size || 0,
          lastModified: obj.lastModified
            ? new Date(obj.lastModified).getTime()
            : undefined,
        });
      });
      marker = res.isTruncated ? res.nextMarker : undefined;
    } while (marker);
    return files;
  }

  async upload(objectName: string, content: Buffer): Promise<void> {
    const key = this.buildKey(objectName);
    await this.client.put(key, content);
  }

  async download(objectName: string): Promise<Buffer> {
    const key = this.buildKey(objectName);
    const res = await this.client.get(key);
    return Buffer.from(res.content);
  }

  private buildKey(objectName: string) {
    const cleanedName = objectName.replace(/^\/+/, "");
    const cleanedBase = (this.basePath || "").replace(/^\/+|\/+$/g, "");
    if (!cleanedBase) return cleanedName;
    return `${cleanedBase}/${cleanedName}`.replace(/\/+/g, "/");
  }

  private stripBase(fullPath: string) {
    const normalized = fullPath.replace(/^\/+/, "");
    const cleanedBase = (this.basePath || "").replace(/^\/+|\/+$/g, "");
    if (!cleanedBase) return normalized;
    if (normalized.startsWith(`${cleanedBase}/`)) {
      return normalized.slice(cleanedBase.length + 1);
    }
    if (normalized === cleanedBase) return "";
    return normalized;
  }
}

class S3Adapter implements ProviderAdapter {
  private client: S3Client;
  private basePrefix: string;
  constructor(private options: S3ResourceSyncOptions) {
    this.client = new S3Client({
      region: options.region,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
      ...(options.endpoint && { endpoint: options.endpoint }),
      forcePathStyle: options.urlStyle === "path",
    });
    this.basePrefix = (options.pathPrefix || "").replace(/^\/+|\/+$/g, "");
  }

  async list(prefix: string): Promise<IRemoteFileInfo[]> {
    const keyPrefix = this.buildKey(prefix);
    const files: IRemoteFileInfo[] = [];
    let continuation: string | undefined;
    do {
      const res = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.options.bucket,
          Prefix: keyPrefix || undefined,
          ContinuationToken: continuation,
        }),
      );
      (res.Contents || []).forEach((obj) => {
        if (!obj.Key || obj.Key.endsWith("/")) return;
        const relativePath = this.stripBase(obj.Key);
        files.push({
          name:
            relativePath.split("/").filter(Boolean).pop() || relativePath || "",
          path: relativePath,
          size: Number(obj.Size || 0),
          lastModified: obj.LastModified
            ? new Date(obj.LastModified).getTime()
            : undefined,
        });
      });
      continuation = res.IsTruncated
        ? res.NextContinuationToken || undefined
        : undefined;
    } while (continuation);
    return files;
  }

  async upload(objectName: string, content: Buffer): Promise<void> {
    const key = this.buildKey(objectName);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
        Body: content,
      }),
    );
  }

  async download(objectName: string): Promise<Buffer> {
    const key = this.buildKey(objectName);
    const res = await this.client.send(
      new GetObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
      }),
    );
    // @ts-ignore
    const bodyStream = res.Body;
    return await streamToBuffer(bodyStream);
  }

  private buildKey(objectName: string) {
    const cleanedName = objectName.replace(/^\/+/, "");
    if (!this.basePrefix) return cleanedName;
    return `${this.basePrefix}/${cleanedName}`.replace(/\/+/g, "/");
  }

  private stripBase(fullPath: string) {
    const normalized = fullPath.replace(/^\/+/, "");
    if (!this.basePrefix) return normalized;
    if (normalized.startsWith(`${this.basePrefix}/`)) {
      return normalized.slice(this.basePrefix.length + 1);
    }
    if (normalized === this.basePrefix) return "";
    return normalized;
  }
}

class WebDavAdapter implements ProviderAdapter {
  private client;
  private basePath: string;
  constructor(options: WebDavResourceSyncOptions) {
    this.client = createClient(options.url, {
      username: options.username,
      password: options.password,
    });
    this.basePath = options.pathPrefix || "";
  }

  async list(prefix: string): Promise<IRemoteFileInfo[]> {
    const startPath = this.buildPath(prefix);
    const queue: string[] = [startPath];
    const visited = new Set<string>();
    const files: IRemoteFileInfo[] = [];

    while (queue.length) {
      const current = queue.shift() as string;
      if (visited.has(current)) continue;
      visited.add(current);
      let contents: any[] = [];
      try {
        const res = await this.client.getDirectoryContents(current);
        const normalized = Array.isArray(res) ? res : (res as any)?.data;
        contents = Array.isArray(normalized) ? normalized : [];
      } catch (error: any) {
        // 目录不存在时返回空列表，方便后续上传时自动创建
        if (
          error?.response?.status === 404 ||
          error?.status === 404 ||
          (typeof error?.message === "string" && error.message.includes("404"))
        ) {
          continue;
        }
        throw error;
      }

      contents.forEach((item: any) => {
        if (item.type === "file") {
          const relativePath = this.stripBase(item.filename || "");
          files.push({
            name:
              relativePath.split("/").filter(Boolean).pop() ||
              item.basename ||
              "",
            path: relativePath,
            size: Number(item.size || 0),
            lastModified: item.lastmod
              ? new Date(item.lastmod).getTime()
              : undefined,
          });
        } else if (item.type === "directory") {
          queue.push(item.filename);
        }
      });
    }
    return files;
  }

  async upload(objectName: string, content: Buffer): Promise<void> {
    const remotePath = this.buildPath(objectName);
    const dirPath = remotePath.split("/").slice(0, -1).join("/") || "/";
    try {
      await this.client.createDirectory(dirPath, { recursive: true });
    } catch {
      // 忽略目录已存在错误
    }
    await this.client.putFileContents(remotePath, content, {
      overwrite: true,
    });
  }

  async download(objectName: string): Promise<Buffer> {
    const remotePath = this.buildPath(objectName);
    const content = await this.client.getFileContents(remotePath);
    if (content instanceof ArrayBuffer) {
      return Buffer.from(content);
    }
    if (Buffer.isBuffer(content)) {
      return content;
    }
    if (typeof content === "string") {
      return Buffer.from(content);
    }
    return Buffer.alloc(0);
  }

  private buildPath(objectName: string) {
    const cleanedName = objectName.replace(/^\/+/, "");
    const cleanedBase = (this.basePath || "")
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");
    const full = [cleanedBase, cleanedName].filter(Boolean).join("/");
    return `/${full.replace(/\/+/g, "/")}`;
  }

  private stripBase(fullPath: string) {
    const normalized = fullPath.replace(/^\/+/, "");
    const cleanedBase = (this.basePath || "")
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");
    if (!cleanedBase) return normalized;
    if (normalized.startsWith(`${cleanedBase}/`)) {
      return normalized.slice(cleanedBase.length + 1);
    }
    if (normalized === cleanedBase) return "";
    return normalized;
  }
}

class GithubAdapter implements ProviderAdapter {
  private basePath: string;
  constructor(private options: GithubResourceSyncOptions) {
    this.basePath = options.pathPrefix || "";
  }

  async list(prefix: string): Promise<IRemoteFileInfo[]> {
    const combinedPath = this.buildPath(prefix);
    const files = await listGithubFiles({
      token: this.options.token,
      owner: this.options.user.name,
      repo: this.options.repo,
      path: combinedPath,
      branch: this.options.branch,
    });

    return files.map((file) => {
      const relativePath = this.stripBase(file.path || file.name || "");
      return {
        name: file.name || relativePath,
        path: relativePath,
        size: file.size || 0,
        hash: file.sha,
      };
    });
  }

  async upload(objectName: string, content: Buffer): Promise<void> {
    const filePath = this.buildPath(objectName);
    const base64Content = content.toString("base64");
    await uploadFileToGithub({
      token: this.options.token,
      owner: this.options.user.name,
      repo: this.options.repo,
      path: filePath,
      content: base64Content,
      message: `Sync resource ${objectName}`,
      branch: this.options.branch,
    });
  }

  async download(objectName: string): Promise<Buffer> {
    const filePath = this.buildPath(objectName);
    const base64Content = await downloadFileFromGithub({
      token: this.options.token,
      owner: this.options.user.name,
      repo: this.options.repo,
      path: filePath,
      branch: this.options.branch,
    });
    return Buffer.from(base64Content, "base64");
  }

  private buildPath(objectName: string) {
    const cleanedName = objectName.replace(/^\/+/, "");
    const cleanedBase = (this.basePath || "")
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");
    return [cleanedBase, cleanedName].filter(Boolean).join("/");
  }

  private stripBase(fullPath: string) {
    const normalized = fullPath.replace(/^\/+/, "");
    const cleanedBase = (this.basePath || "")
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");
    if (!cleanedBase) return normalized;
    if (normalized.startsWith(`${cleanedBase}/`)) {
      return normalized.slice(cleanedBase.length + 1);
    }
    if (normalized === cleanedBase) return "";
    return normalized;
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
    ipcMain.handle("resource-sync:start", async (_event, options) => {
      return await this.startSync(options as ResourceSyncOptions);
    });

    ipcMain.handle("resource-sync:resume", async (_event, options) => {
      const payload = (options as ResourceSyncOptions) || this.lastOptions;
      if (!payload) return { ok: false, message: "缺少同步配置" };
      return await this.startSync(payload);
    });

    ipcMain.handle("resource-sync:retry-failed", async (_event, options) => {
      const payload = (options as ResourceSyncOptions) || this.lastOptions;
      if (!payload) return { ok: false, message: "缺少同步配置" };
      return await this.startSync(payload, { retryFailedOnly: true });
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

    ipcMain.handle("resource-sync:refresh", async (_event, options) => {
      try {
        const payload = (options as ResourceSyncOptions) || this.lastOptions;
        if (!payload) {
          throw new Error("缺少同步配置");
        }
        if (this.running) {
          throw new Error("资源同步正在进行中，无法刷新");
        }
        const status = await this.refreshStatus(payload);
        return status;
      } catch (error) {
        log.error("[resource-sync] refresh failed", error);
        throw error;
      }
    });
  }

  private getRateLimitConfig(
    provider: ResourceSyncProvider,
    override?: Partial<IRateLimitConfig>,
  ) {
    const base = RATE_LIMIT_CONFIGS[provider] || RATE_LIMIT_CONFIGS.alioss;
    const merged = {
      ...base,
      ...override,
    };
    merged.maxConcurrent = Math.min(merged.maxConcurrent, 3);
    return merged;
  }

  private createAdapter(options: ResourceSyncOptions) {
    switch (options.provider) {
      case "alioss":
        return new AliossAdapter(options);
      case "s3":
        return new S3Adapter(options);
      case "webdav":
        return new WebDavAdapter(options);
      case "github":
        return new GithubAdapter(options);
      default:
        throw new Error("不支持的同步提供者");
    }
  }

  private async startSync(
    options: ResourceSyncOptions,
    flags?: { retryFailedOnly?: boolean },
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
      this.adapter = this.createAdapter(options);
      const statusMeta = await this.prepareStatusFile(options);
      this.statusMeta = statusMeta;
      this.statuses = { ...statusMeta.file.files };

      const blacklist = this.getResourceBlacklist();
      let retryTargets: Set<string> | null = null;
      if (flags?.retryFailedOnly) {
        retryTargets = this.markErrorsPending();
        if (blacklist.size && retryTargets?.size) {
          blacklist.forEach((name) => retryTargets?.delete(name));
        }
      }

      const plan = await this.buildPlan(this.adapter, retryTargets, blacklist);
      log.info("[resource-sync] plan built", {
        total: plan.tasks.length,
        uploads: plan.tasks.filter((t) => t.direction === "upload").length,
        downloads: plan.tasks.filter((t) => t.direction === "download").length,
      });
      await this.saveStatusFile();

      if (plan.tasks.length === 0) {
        this.progress.status =
          this.progress.errorCount > 0 ? "error" : "completed";
        this.notifyProgress();
        if (this.progress.status === "completed") {
          this.sendCompletion();
        } else {
          this.sendErrorNotification("部分资源同步失败");
        }
        return {
          ok: this.progress.status === "completed",
          message: flags?.retryFailedOnly
            ? "没有需要重试的文件"
            : "没有需要同步的文件",
        };
      }

      this.progress.status = "syncing";
      this.notifyProgress();

      this.executor = new RateLimitedExecutor(
        this.getRateLimitConfig(options.provider, options.rateLimit),
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
      this.running = false;
      this.progress.currentFile = null;
    }
  }

  private async refreshStatus(options: ResourceSyncOptions) {
    let adapter: ProviderAdapter | null = null;
    try {
      adapter = this.createAdapter(options);
      this.adapter = adapter;
    } catch (error) {
      log.warn(
        "[resource-sync] refresh create adapter failed, use local only",
        error,
      );
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
      upload: plan.tasks.filter((t) => t.direction === "upload").length,
      download: plan.tasks.filter((t) => t.direction === "download").length,
      adapterReady: !!adapter,
    });
    return this.statusMeta?.file || null;
  }

  private markErrorsPending() {
    const retryTargets = new Set<string>();
    Object.keys(this.statuses).forEach((name) => {
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
      const rows = db
        .prepare("SELECT file_name FROM resource_sync_blacklist")
        .all() as Array<{ file_name: string }>;
      return new Set(rows.map((row) => row.file_name));
    } catch (error) {
      log.error("[resource-sync] load blacklist failed", error);
      return new Set<string>();
    }
  }

  private async prepareStatusFile(
    options: ResourceSyncOptions,
  ): Promise<StatusFileMeta> {
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

    Object.keys(statusFile.files).forEach((name) => {
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
    const hash = (value: string) =>
      crypto.createHash("md5").update(value).digest("hex").slice(0, 8);

    switch (options.provider) {
      case "alioss": {
        const pathHash = hash(options.path || "/");
        return {
          fileName: `alioss-${options.bucket}-${pathHash}.json`,
          config: {
            bucket: options.bucket,
            region: options.region,
            path: options.path || "/",
          },
        };
      }
      case "s3": {
        const prefixHash = hash(options.pathPrefix || "");
        return {
          fileName: `s3-${options.bucket}-${prefixHash}.json`,
          config: {
            bucket: options.bucket,
            region: options.region,
            pathPrefix: options.pathPrefix || "",
          },
        };
      }
      case "webdav": {
        let host = options.url;
        try {
          host = new URL(options.url).host;
        } catch {
          // ignore
        }
        const hostHash = hash(host);
        const pathHash = hash(options.pathPrefix || "");
        return {
          fileName: `webdav-${hostHash}-${pathHash}.json`,
          config: {
            host,
            pathPrefix: options.pathPrefix || "",
          },
        };
      }
      case "github": {
        return {
          fileName: `github-${options.repo}-${options.branch}.json`,
          config: {
            repo: options.repo,
            branch: options.branch,
            pathPrefix: options.pathPrefix || "",
          },
        };
      }
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
    blacklist?: Set<string> | null,
  ) {
    if (!adapter) {
      log.warn(
        "[resource-sync] buildPlan without remote adapter, only local files will be considered",
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
        log.warn(
          "[resource-sync] list remote files failed, fallback to local only",
          error,
        );
        remoteFiles = [];
      }
    }
    const remoteMap = new Map<string, IRemoteFileInfo>(
      remoteFiles.map((item) => [item.name, item]),
    );

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
    size: number,
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
    this.progress.uploadCount = statuses.filter(
      (s) => s.syncDirection === "upload",
    ).length;
    this.progress.downloadCount = statuses.filter(
      (s) => s.syncDirection === "download",
    ).length;
    this.progress.skippedCount =
      skippedCount !== undefined
        ? skippedCount
        : statuses.filter((s) => s.syncDirection === null).length;
    this.progress.errorCount = statuses.filter(
      (s) => s.syncStatus === ResourceSyncStatus.Error,
    ).length;
    this.progress.processedFiles = statuses.filter(
      (s) =>
        s.syncStatus === ResourceSyncStatus.Synced ||
        s.syncStatus === ResourceSyncStatus.Error,
    ).length;
  }

  private async executeTasks(tasks: SyncTask[]) {
    if (!this.executor || !this.adapter) return;
    const promises = tasks.map((task) =>
      this.executor!.execute(() => this.runTask(task)),
    );
    await Promise.allSettled(promises);
  }

  private async runTask(task: SyncTask) {
    if (!this.adapter) return;
    if (this.cancelRequested) return;

    this.statuses[task.name] = {
      ...(this.statuses[task.name] ||
        this.initStatus(undefined, task.direction, task.size)),
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
        ...(this.statuses[task.name] ||
          this.initStatus(undefined, task.direction, task.size)),
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
    await fs.writeFile(
      this.statusMeta.path,
      JSON.stringify(content, null, 2),
      "utf-8",
    );
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
