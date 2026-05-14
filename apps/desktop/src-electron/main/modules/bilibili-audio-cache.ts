import { ipcMain, WebContents } from "electron";
import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";
import fetch from "node-fetch";
import PathUtil from "../utils/PathUtil";
import log from "electron-log";

const CACHE_DIR = "bilibili-audio-cache";
const CACHE_CONFIG = "bilibili-audio-cache-config.json";

let requestCounter = 0;
const activeSenders = new Map<number, WebContents>();
let cacheConfigQueue: Promise<void> = Promise.resolve();
const inFlightDownloads = new Map<string, Promise<BilibiliAudioCacheResult>>();

interface BilibiliAudioCacheOptions {
  audioUrl: string;
  bvid: string;
  cid: string;
  title?: string;
  requestId?: number;
}

interface BilibiliAudioCacheResult {
  localPath: string;
  cached: boolean;
  fileSize: number;
}

interface BilibiliAudioCacheEntry {
  bvid: string;
  cid: string;
  title: string;
  localPath: string;
  fileSize: number;
  createdAt: string;
  lastAccessed: string;
}

interface BilibiliAudioCacheConfig {
  entries: Record<string, BilibiliAudioCacheEntry>;
  totalSize: number;
  lastCleanup: string;
}

interface BilibiliAudioProgressEvent {
  requestId: number;
  stage: "downloading" | "completed" | "error";
  progress: number;
  message: string;
  downloaded?: number;
  total?: number;
}

function isPrivateOrLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  if (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized.endsWith(".localhost")
  ) {
    return true;
  }

  const ipv4 = normalized.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!ipv4) return false;

  const [, aRaw, bRaw] = ipv4;
  const a = Number(aRaw);
  const b = Number(bRaw);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

function validatePublicHttpUrl(rawUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("音频地址无效");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("音频地址仅支持 http/https 协议");
  }
  if (isPrivateOrLocalHostname(parsed.hostname)) {
    throw new Error("音频地址不能指向本机或内网地址");
  }
}

export function validateBilibiliAudioCacheOptions(
  options: BilibiliAudioCacheOptions,
): void {
  if (!options || typeof options.audioUrl !== "string") {
    throw new Error("音频地址无效");
  }
  validatePublicHttpUrl(options.audioUrl);
  if (!options.bvid || !options.cid) {
    throw new Error("Bilibili 音频缓存参数不完整");
  }
}

function getRequestId(options?: Pick<BilibiliAudioCacheOptions, "requestId">) {
  return Number.isSafeInteger(options?.requestId)
    ? (options?.requestId as number)
    : getNextRequestId();
}

async function withCacheConfigLock<T>(task: () => Promise<T>): Promise<T> {
  const run = cacheConfigQueue.then(task, task);
  cacheConfigQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function calculateTotalSize(config: BilibiliAudioCacheConfig): number {
  return Object.values(config.entries).reduce(
    (total, entry) => total + (entry.fileSize || 0),
    0,
  );
}

/**
 * 发送进度事件
 */
function sendProgressEvent(event: BilibiliAudioProgressEvent): void {
  const sender = activeSenders.get(event.requestId);
  if (sender && !sender.isDestroyed()) {
    sender.send("bilibili-audio-cache-progress", event);
  }
}

/**
 * 获取下一个请求 ID
 */
function getNextRequestId(): number {
  return ++requestCounter;
}

/**
 * 获取缓存目录路径
 */
async function getCacheDir(): Promise<string> {
  const editorDir = PathUtil.getAppDir();
  const cacheDir = path.join(editorDir, CACHE_DIR);

  try {
    await fs.access(cacheDir);
  } catch {
    await fs.mkdir(cacheDir, { recursive: true });
  }

  return cacheDir;
}

/**
 * 获取缓存配置文件路径
 */
async function getConfigPath(): Promise<string> {
  const editorDir = PathUtil.getAppDir();
  return path.join(editorDir, CACHE_CONFIG);
}

/**
 * 读取缓存配置
 */
async function readCacheConfig(): Promise<BilibiliAudioCacheConfig> {
  const configPath = await getConfigPath();

  try {
    const configContent = await fs.readFile(configPath, "utf-8");
    return JSON.parse(configContent);
  } catch {
    return {
      entries: {},
      totalSize: 0,
      lastCleanup: new Date().toISOString(),
    };
  }
}

/**
 * 写入缓存配置
 */
async function writeCacheConfig(
  config: BilibiliAudioCacheConfig,
): Promise<void> {
  const configPath = await getConfigPath();
  const tempPath = `${configPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(config, null, 2));
  await fs.rename(tempPath, configPath);
}

/**
 * 生成缓存键
 */
function generateCacheKey(bvid: string, cid: string): string {
  const content = `${bvid}-${cid}-audio`;
  return crypto.createHash("md5").update(content).digest("hex");
}

/**
 * 下载音频文件
 */
async function downloadAudioFile(
  url: string,
  outputPath: string,
  onProgress?: (downloaded: number, total: number) => void,
  requestId?: number,
): Promise<void> {
  const response = await fetch(url, {
    headers: {
      Referer: "https://www.bilibili.com/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`下载失败: HTTP ${response.status}`);
  }

  const totalSize = parseInt(response.headers.get("content-length") || "0");
  let downloadedSize = 0;

  const fileStream = await fs.open(outputPath, "w");
  const writer = fileStream.createWriteStream();

  return new Promise((resolve, reject) => {
    response.body?.on("data", (chunk: Buffer) => {
      downloadedSize += chunk.length;
      writer.write(chunk);
      onProgress?.(downloadedSize, totalSize);

      if (requestId) {
        sendProgressEvent({
          requestId,
          stage: "downloading",
          progress: totalSize > 0 ? (downloadedSize / totalSize) * 100 : 0,
          message: `正在下载音频...`,
          downloaded: downloadedSize,
          total: totalSize,
        });
      }
    });

    response.body?.on("end", async () => {
      await writer.end();
      await fileStream.close();
      resolve();
    });

    response.body?.on("error", async (error) => {
      await writer.end();
      await fileStream.close();
      reject(error);
    });
  });
}

/**
 * 缓存 Bilibili 音频
 */
async function cacheBilibiliAudio(
  options: BilibiliAudioCacheOptions,
): Promise<BilibiliAudioCacheResult> {
  validateBilibiliAudioCacheOptions(options);
  const { audioUrl, bvid, cid, title = "", requestId } = options;

  // 检查是否已缓存
  const cacheKey = generateCacheKey(bvid, cid);
  const cachedResult = await withCacheConfigLock(async () => {
    const config = await readCacheConfig();
    if (config.entries[cacheKey]) {
      const entry = config.entries[cacheKey];
      try {
        await fs.access(entry.localPath);
        entry.lastAccessed = new Date().toISOString();
        config.totalSize = calculateTotalSize(config);
        await writeCacheConfig(config);

        const stats = await fs.stat(entry.localPath);
        return {
          localPath: entry.localPath,
          cached: true,
          fileSize: stats.size,
        };
      } catch {
        delete config.entries[cacheKey];
        config.totalSize = calculateTotalSize(config);
        await writeCacheConfig(config);
      }
    }
    return null;
  });

  if (cachedResult) {
    return cachedResult;
  }

  const inFlightDownload = inFlightDownloads.get(cacheKey);
  if (inFlightDownload) {
    if (requestId) {
      sendProgressEvent({
        requestId,
        stage: "downloading",
        progress: 0,
        message: "等待已有音频下载任务完成...",
        downloaded: 0,
        total: 0,
      });
    }
    const result = await inFlightDownload;
    if (requestId) {
      sendProgressEvent({
        requestId,
        stage: "completed",
        progress: 100,
        message: `下载完成 (${(result.fileSize / 1024 / 1024).toFixed(2)}MB)`,
        downloaded: result.fileSize,
        total: result.fileSize,
      });
    }
    return result;
  }

  const outputFileName = `${cacheKey}.m4a`;
  let outputPath = "";

  const downloadTask = (async (): Promise<BilibiliAudioCacheResult> => {
    const cacheDir = await getCacheDir();
    outputPath = path.join(cacheDir, outputFileName);
    try {
      console.log(`开始缓存 Bilibili 音频: ${bvid}-${cid}`);

      // 发送开始下载事件
      if (requestId) {
        sendProgressEvent({
          requestId,
          stage: "downloading",
          progress: 0,
          message: "开始下载音频...",
          downloaded: 0,
          total: 0,
        });
      }

      // 下载音频
      await downloadAudioFile(
        audioUrl,
        outputPath,
        (downloaded, total) => {
          console.log(
            `音频下载进度: ${((downloaded / total) * 100).toFixed(1)}%`,
          );
        },
        requestId,
      );

      // 获取文件大小
      const stats = await fs.stat(outputPath);

      // 更新配置
      const newEntry: BilibiliAudioCacheEntry = {
        bvid,
        cid,
        title,
        localPath: outputPath,
        fileSize: stats.size,
        createdAt: new Date().toISOString(),
        lastAccessed: new Date().toISOString(),
      };

      await withCacheConfigLock(async () => {
        const config = await readCacheConfig();
        config.entries[cacheKey] = newEntry;
        config.totalSize = calculateTotalSize(config);
        await writeCacheConfig(config);
      });

      console.log(`Bilibili 音频缓存完成: ${outputPath}`);

      // 发送完成事件
      if (requestId) {
        sendProgressEvent({
          requestId,
          stage: "completed",
          progress: 100,
          message: `下载完成 (${(stats.size / 1024 / 1024).toFixed(2)}MB)`,
          downloaded: stats.size,
          total: stats.size,
        });
      }

      return {
        localPath: outputPath,
        cached: false,
        fileSize: stats.size,
      };
    } catch (error) {
      // 发送错误事件
      if (requestId) {
        sendProgressEvent({
          requestId,
          stage: "error",
          progress: 0,
          message: `下载失败: ${error instanceof Error ? error.message : String(error)}`,
        });
      }

      // 清理失败的文件
      try {
        await fs.unlink(outputPath);
      } catch {
        // 忽略清理错误
      }

      throw error;
    }
  })();

  inFlightDownloads.set(cacheKey, downloadTask);
  try {
    return await downloadTask;
  } finally {
    if (inFlightDownloads.get(cacheKey) === downloadTask) {
      inFlightDownloads.delete(cacheKey);
    }
  }
}

/**
 * 获取缓存状态
 */
async function getBilibiliAudioCacheStatus(
  bvid: string,
  cid: string,
): Promise<BilibiliAudioCacheResult | null> {
  const cacheKey = generateCacheKey(bvid, cid);
  return await withCacheConfigLock(async () => {
    const config = await readCacheConfig();
    const entry = config.entries[cacheKey];
    if (!entry) {
      return null;
    }

    try {
      await fs.access(entry.localPath);
      const stats = await fs.stat(entry.localPath);

      return {
        localPath: entry.localPath,
        cached: true,
        fileSize: stats.size,
      };
    } catch {
      delete config.entries[cacheKey];
      config.totalSize = calculateTotalSize(config);
      await writeCacheConfig(config);
      return null;
    }
  });
}

/**
 * 列出所有缓存
 */
async function listBilibiliAudioCache(): Promise<BilibiliAudioCacheEntry[]> {
  return await withCacheConfigLock(async () => {
    const config = await readCacheConfig();
    const entries: BilibiliAudioCacheEntry[] = [];
    let changed = false;

    for (const [cacheKey, entry] of Object.entries(config.entries)) {
      try {
        const stats = await fs.stat(entry.localPath);
        const latestEntry = {
          ...entry,
          fileSize: stats.size,
        };
        entries.push(latestEntry);
        if (entry.fileSize !== stats.size) {
          config.entries[cacheKey] = latestEntry;
          changed = true;
        }
      } catch {
        delete config.entries[cacheKey];
        changed = true;
      }
    }

    if (changed) {
      config.totalSize = calculateTotalSize(config);
      await writeCacheConfig(config);
    }

    return entries.sort(
      (a, b) =>
        new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime(),
    );
  });
}

/**
 * 清理所有缓存
 */
async function clearBilibiliAudioCache(): Promise<void> {
  await withCacheConfigLock(async () => {
    const config = await readCacheConfig();

    for (const entry of Object.values(config.entries)) {
      try {
        await fs.unlink(entry.localPath);
      } catch {
        // 忽略删除错误
      }
    }

    await writeCacheConfig({
      entries: {},
      totalSize: 0,
      lastCleanup: new Date().toISOString(),
    });
  });
  console.log("Bilibili 音频缓存已清理");
}

/**
 * 删除特定缓存
 */
async function deleteBilibiliAudioCache(
  bvid: string,
  cid: string,
): Promise<boolean> {
  const cacheKey = generateCacheKey(bvid, cid);
  return await withCacheConfigLock(async () => {
    const config = await readCacheConfig();
    const entry = config.entries[cacheKey];
    if (!entry) {
      return false;
    }

    let shouldRemoveEntry = false;
    try {
      await fs.unlink(entry.localPath);
      shouldRemoveEntry = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
        shouldRemoveEntry = true;
      }
    }

    if (!shouldRemoveEntry) {
      return false;
    }

    delete config.entries[cacheKey];
    config.totalSize = calculateTotalSize(config);
    await writeCacheConfig(config);
    return true;
  });
}

/**
 * 初始化 Bilibili 音频缓存模块
 */
export async function init(): Promise<void> {
  log.log("正在初始化 Bilibili 音频缓存模块...");

  // 确保缓存目录存在
  await getCacheDir();

  // 注册 IPC 处理器
  ipcMain.handle("cache_bilibili_audio", async (event, { options }) => {
    const requestId = getRequestId(options);
    activeSenders.set(requestId, event.sender);

    const optionsWithRequestId = {
      ...options,
      requestId,
    };

    try {
      const result = await cacheBilibiliAudio(optionsWithRequestId);
      activeSenders.delete(requestId);
      return { ...result, requestId };
    } catch (error) {
      activeSenders.delete(requestId);
      throw error;
    }
  });

  ipcMain.handle(
    "get_bilibili_audio_cache_status",
    async (_, { bvid, cid }) => {
      return await getBilibiliAudioCacheStatus(bvid, cid);
    },
  );

  ipcMain.handle("clear_bilibili_audio_cache", async () => {
    return await clearBilibiliAudioCache();
  });

  ipcMain.handle("list_bilibili_audio_cache", async () => {
    return await listBilibiliAudioCache();
  });

  ipcMain.handle("delete_bilibili_audio_cache", async (_, { bvid, cid }) => {
    return await deleteBilibiliAudioCache(bvid, cid);
  });

  console.log("Bilibili 音频缓存模块初始化完成");
}

// 导出核心函数供其他模块使用
export {
  cacheBilibiliAudio,
  getBilibiliAudioCacheStatus,
  type BilibiliAudioCacheOptions,
  type BilibiliAudioCacheResult,
};

export default { init };
