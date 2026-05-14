import { ipcMain, WebContents } from "electron";
import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";
import PathUtil from "../utils/PathUtil";
import YtDlpService, { YtDlpDownloadProgress } from "../utils/YtDlpService";
import log from "electron-log";

const CACHE_DIR = "youtube-audio-cache";
const CACHE_CONFIG = "youtube-audio-cache-config.json";

let requestCounter = 0;
const activeSenders = new Map<number, WebContents>();
let cacheConfigQueue: Promise<void> = Promise.resolve();
const inFlightDownloads = new Map<string, Promise<YoutubeAudioCacheResult>>();

interface StreamOption {
  id: string;
  resolution: string;
  format: string;
  fps?: number;
  codecs?: string;
  bitrate?: number;
  size?: string;
  videoOnly: boolean;
  audioOnly: boolean;
}

interface YoutubeAudioCacheOptions {
  url: string;
  audioStream: StreamOption;
  proxy?: string;
  requestId?: number;
}

interface YoutubeAudioCacheResult {
  localPath: string;
  cached: boolean;
  fileSize: number;
}

interface YoutubeAudioCacheEntry {
  url: string;
  title: string;
  localPath: string;
  fileSize: number;
  createdAt: string;
  lastAccessed: string;
}

interface YoutubeAudioCacheConfig {
  entries: Record<string, YoutubeAudioCacheEntry>;
  totalSize: number;
  lastCleanup: string;
}

interface YoutubeAudioProgressEvent {
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

export function validateYoutubeAudioCacheOptions(
  options: YoutubeAudioCacheOptions,
): void {
  if (!options || typeof options.url !== "string") {
    throw new Error("音频地址无效");
  }
  validatePublicHttpUrl(options.url);
  if (!options.audioStream?.id) {
    throw new Error("YouTube 音频流参数不完整");
  }
}

function getRequestId(options?: Pick<YoutubeAudioCacheOptions, "requestId">) {
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

function calculateTotalSize(conf: YoutubeAudioCacheConfig): number {
  return Object.values(conf.entries).reduce(
    (total, entry) => total + (entry.fileSize || 0),
    0,
  );
}

// --- Helper functions ---

function getNextRequestId(): number {
  return ++requestCounter;
}

function sendProgress(event: YoutubeAudioProgressEvent) {
  const sender = activeSenders.get(event.requestId);
  if (sender && !sender.isDestroyed()) {
    sender.send("youtube-audio-cache-progress", event);
  }
}

async function ensureDir(): Promise<string> {
  const app = PathUtil.getAppDir();
  const dir = path.join(app, CACHE_DIR);
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
  return dir;
}

function getConfigPath(): string {
  return path.join(PathUtil.getAppDir(), CACHE_CONFIG);
}

async function readConfig(): Promise<YoutubeAudioCacheConfig> {
  const cfgPath = getConfigPath();
  try {
    const text = await fs.readFile(cfgPath, "utf-8");
    return JSON.parse(text) as YoutubeAudioCacheConfig;
  } catch {
    return { entries: {}, totalSize: 0, lastCleanup: new Date().toISOString() };
  }
}

async function writeConfig(conf: YoutubeAudioCacheConfig): Promise<void> {
  const cfgPath = getConfigPath();
  const tempPath = `${cfgPath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(conf, null, 2));
  await fs.rename(tempPath, cfgPath);
}

function keyOf(url: string): string {
  return crypto
    .createHash("md5")
    .update(url + "-audio")
    .digest("hex");
}

function relayDownloadProgress(
  progress: YtDlpDownloadProgress,
  requestId?: number,
) {
  if (requestId === undefined) return;
  if (progress.stage === "downloading") {
    sendProgress({
      requestId,
      stage: "downloading",
      progress: progress.percent,
      message: progress.message || "正在下载音频...",
      downloaded: progress.downloadedBytes,
      total: progress.totalBytes,
    });
  }
}

// --- Core functions ---

export async function cacheYoutubeAudio(
  options: YoutubeAudioCacheOptions,
  requestId?: number,
): Promise<YoutubeAudioCacheResult> {
  validateYoutubeAudioCacheOptions(options);
  const dir = await ensureDir();

  const { url } = options;
  const cacheKey = keyOf(url);

  // Check existing cache
  const cachedResult = await withCacheConfigLock(async () => {
    const conf = await readConfig();
    const existing = conf.entries[cacheKey];
    if (existing) {
      try {
        await fs.access(existing.localPath);
        const stat = await fs.stat(existing.localPath);
        existing.lastAccessed = new Date().toISOString();
        conf.totalSize = calculateTotalSize(conf);
        await writeConfig(conf);
        return {
          localPath: existing.localPath,
          cached: true,
          fileSize: stat.size,
        };
      } catch {
        delete conf.entries[cacheKey];
        conf.totalSize = calculateTotalSize(conf);
        await writeConfig(conf);
      }
    }
    return null;
  });

  if (cachedResult) {
    return cachedResult;
  }

  const inFlightDownload = inFlightDownloads.get(cacheKey);
  if (inFlightDownload) {
    if (requestId !== undefined) {
      sendProgress({
        requestId,
        stage: "downloading",
        progress: 0,
        message: "等待已有音频下载任务完成...",
      });
    }
    const result = await inFlightDownload;
    if (requestId !== undefined) {
      sendProgress({
        requestId,
        stage: "completed",
        progress: 100,
        message: "音频下载完成",
        downloaded: result.fileSize,
        total: result.fileSize,
      });
    }
    return result;
  }

  const downloadTask = (async (): Promise<YoutubeAudioCacheResult> => {
    if (requestId !== undefined) {
      sendProgress({
        requestId,
        stage: "downloading",
        progress: 0,
        message: "开始下载音频...",
      });
    }

    try {
      const { outputPath, fileSize } = await YtDlpService.downloadVideo({
        url: options.url,
        videoFormatId: options.audioStream.id,
        audioFormatId: "",
        outputDir: dir,
        basename: cacheKey,
        targetExt: "m4a",
        proxy: options.proxy,
        onProgress: (progress) => relayDownloadProgress(progress, requestId),
      });

      if (requestId !== undefined) {
        sendProgress({
          requestId,
          stage: "completed",
          progress: 100,
          message: "音频下载完成",
        });
      }

      await withCacheConfigLock(async () => {
        const conf = await readConfig();
        conf.entries[cacheKey] = {
          url,
          title: url,
          localPath: outputPath,
          fileSize,
          createdAt: new Date().toISOString(),
          lastAccessed: new Date().toISOString(),
        };
        conf.totalSize = calculateTotalSize(conf);
        await writeConfig(conf);
      });

      return { localPath: outputPath, cached: false, fileSize };
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : String(err);
      log.error(
        `[YouTubeAudio] download failed: ${err instanceof Error ? err.stack || err.message : String(err)}`,
      );

      const isAbort = /aborted|AbortError|The user aborted a request/i.test(
        rawMessage,
      );
      const userMessage = isAbort
        ? "网络超时，请检查代理或稍后再试"
        : "音频下载失败，请稍后重试";

      if (requestId !== undefined) {
        sendProgress({
          requestId,
          stage: "error",
          progress: 0,
          message: userMessage,
        });
      }
      throw new Error(userMessage);
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

export async function getYoutubeAudioCacheStatus(
  url: string,
): Promise<{ localPath: string; fileSize: number } | null> {
  return await withCacheConfigLock(async () => {
    const conf = await readConfig();
    const key = keyOf(url);
    const entry = conf.entries[key];
    if (!entry) return null;
    try {
      await fs.access(entry.localPath);
      const stat = await fs.stat(entry.localPath);
      return { localPath: entry.localPath, fileSize: stat.size };
    } catch {
      delete conf.entries[key];
      conf.totalSize = calculateTotalSize(conf);
      await writeConfig(conf);
      return null;
    }
  });
}

async function listYoutubeAudioCache(): Promise<YoutubeAudioCacheEntry[]> {
  return await withCacheConfigLock(async () => {
    const conf = await readConfig();
    const entries: YoutubeAudioCacheEntry[] = [];
    let changed = false;

    for (const [cacheKey, entry] of Object.entries(conf.entries)) {
      try {
        const stat = await fs.stat(entry.localPath);
        const latestEntry = {
          ...entry,
          fileSize: stat.size,
        };
        entries.push(latestEntry);
        if (entry.fileSize !== stat.size) {
          conf.entries[cacheKey] = latestEntry;
          changed = true;
        }
      } catch {
        delete conf.entries[cacheKey];
        changed = true;
      }
    }

    if (changed) {
      conf.totalSize = calculateTotalSize(conf);
      await writeConfig(conf);
    }

    return entries.sort(
      (a, b) =>
        new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime(),
    );
  });
}

async function clearYoutubeAudioCache(): Promise<void> {
  await withCacheConfigLock(async () => {
    const conf = await readConfig();
    const entries = Object.values(conf.entries);
    for (const entry of entries) {
      try {
        await fs.unlink(entry.localPath);
      } catch (e) {
        log.warn("[YouTubeAudio] Failed to delete cache file", e);
      }
    }
    await writeConfig({
      entries: {},
      totalSize: 0,
      lastCleanup: new Date().toISOString(),
    });
  });
}

async function deleteYoutubeAudioCache(url: string): Promise<boolean> {
  return await withCacheConfigLock(async () => {
    const conf = await readConfig();
    const key = keyOf(url);
    const entry = conf.entries[key];
    if (!entry) return false;

    try {
      await fs.unlink(entry.localPath);
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code !== "ENOENT") {
        log.warn("[YouTubeAudio] Failed to delete cache file", e);
        return false;
      }
    }

    delete conf.entries[key];
    conf.totalSize = calculateTotalSize(conf);
    await writeConfig(conf);
    return true;
  });
}

// --- IPC Registration ---

async function init() {
  await ensureDir();

  ipcMain.handle("cache_youtube_audio", async (event, { options }) => {
    const requestId = getRequestId(options);
    activeSenders.set(requestId, event.sender);
    try {
      const res = await cacheYoutubeAudio(options, requestId);
      activeSenders.delete(requestId);
      return { ...res, requestId };
    } catch (e) {
      activeSenders.delete(requestId);
      throw e;
    }
  });

  ipcMain.handle("get_youtube_audio_cache_status", async (_event, { url }) => {
    return await getYoutubeAudioCacheStatus(url);
  });

  ipcMain.handle("clear_youtube_audio_cache", async () => {
    await clearYoutubeAudioCache();
  });

  ipcMain.handle("list_youtube_audio_cache", async () => {
    return await listYoutubeAudioCache();
  });

  ipcMain.handle("delete_youtube_audio_cache", async (_event, { url }) => {
    return await deleteYoutubeAudioCache(url);
  });
}

export default { init };
