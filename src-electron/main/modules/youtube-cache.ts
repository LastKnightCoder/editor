import { ipcMain, WebContents } from "electron";
import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import type { StreamOption } from "@/types/youtube";
import PathUtil from "../utils/PathUtil";
import log from "electron-log";
import YtDlpService, { YtDlpDownloadProgress } from "../utils/YtDlpService";

interface YoutubeCacheEntry {
  url: string;
  quality: string;
  title: string;
  localPath: string;
  fileSize: number;
  createdAt: string;
  lastAccessed: string;
}

interface YoutubeCacheConfig {
  entries: Record<string, YoutubeCacheEntry>;
  totalSize: number;
}

interface YoutubeCacheResult {
  localPath: string;
  cached: boolean;
  fileSize: number;
}

interface YoutubeProgressEvent {
  requestId: number;
  stage: "downloading" | "merging" | "completed" | "error";
  progress: number;
  message: string;
  downloaded?: number;
  total?: number;
  videoDownloaded?: number;
  audioDownloaded?: number;
  videoTotal?: number;
  audioTotal?: number;
  totalSize?: number;
  type?: "video" | "audio";
}

const YT_CACHE_DIR = "youtube-cache";
const YT_CACHE_CONFIG = "youtube-cache-config.json";

let reqId = 0;
const activeSenders = new Map<number, WebContents>();

function nextReqId() {
  return ++reqId;
}

function sendProgress(event: YoutubeProgressEvent) {
  const sender = activeSenders.get(event.requestId);
  if (sender && !sender.isDestroyed())
    sender.send("youtube-cache-progress", event);
}

async function ensureDir(): Promise<string> {
  const app = PathUtil.getAppDir();
  const dir = path.join(app, YT_CACHE_DIR);
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
  return dir;
}

async function readConfig(): Promise<YoutubeCacheConfig> {
  const app = PathUtil.getAppDir();
  const cfg = path.join(app, YT_CACHE_CONFIG);
  try {
    const t = await fs.readFile(cfg, "utf-8");
    return JSON.parse(t) as YoutubeCacheConfig;
  } catch {
    return { entries: {}, totalSize: 0 };
  }
}

async function writeConfig(conf: YoutubeCacheConfig) {
  const app = PathUtil.getAppDir();
  const cfg = path.join(app, YT_CACHE_CONFIG);
  await fs.writeFile(cfg, JSON.stringify(conf, null, 2));
}

function keyOf(url: string) {
  return crypto.createHash("md5").update(url).digest("hex");
}

export async function init() {
  if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic as unknown as string);
  await ensureDir();

  ipcMain.handle("cache_youtube_video", async (event, { options }) => {
    const requestId = nextReqId();
    activeSenders.set(requestId, event.sender);
    try {
      const res = await cacheYoutube(options, requestId);
      activeSenders.delete(requestId);
      return { ...res, requestId };
    } catch (e) {
      activeSenders.delete(requestId);
      throw e;
    }
  });

  ipcMain.handle(
    "get_youtube_video_info",
    async (_event, { url, proxy }: { url: string; proxy?: string }) => {
      try {
        const info = await YtDlpService.fetchVideoInfo(url, proxy);
        return info;
      } catch (e) {
        log.warn(
          `[YouTube] get_youtube_video_info failed: ${e instanceof Error ? e.message : String(e)}`,
        );
        return null;
      }
    },
  );

  ipcMain.handle("get_youtube_cache_status", async (_e, { url }) => {
    const conf = await readConfig();
    const entry = conf.entries[keyOf(url)];
    if (!entry) return null;
    try {
      await fs.access(entry.localPath);
      const stat = await fs.stat(entry.localPath);
      return { localPath: entry.localPath, fileSize: stat.size };
    } catch {
      delete conf.entries[keyOf(url)];
      await writeConfig(conf);
      return null;
    }
  });

  ipcMain.handle("clear_youtube_cache", async () => {
    const conf = await readConfig();
    const entries = Object.values(conf.entries);
    for (const entry of entries) {
      try {
        await fs.unlink(entry.localPath);
      } catch (e) {
        log.warn("Failed to delete YouTube cache file", e);
      }
    }
    await writeConfig({ entries: {}, totalSize: 0 });
  });

  ipcMain.handle("delete_youtube_cache", async (_e, { url }) => {
    const conf = await readConfig();
    const k = keyOf(url);
    const entry = conf.entries[k];
    if (!entry) return false;
    try {
      await fs.unlink(entry.localPath);
    } catch {
      return false;
    }
    conf.totalSize -= entry.fileSize;
    delete conf.entries[k];
    await writeConfig(conf);
    return true;
  });

  ipcMain.handle("get_youtube_cache_size", async () => {
    const conf = await readConfig();
    return conf.totalSize || 0;
  });

  ipcMain.handle("list_youtube_cache", async () => {
    const conf = await readConfig();
    return Object.values(conf.entries || {});
  });
}

async function cacheYoutube(
  options: {
    url: string;
    videoStream: StreamOption;
    audioStream: StreamOption;
    proxy?: string;
  },
  requestId: number,
): Promise<YoutubeCacheResult> {
  const dir = await ensureDir();
  const conf = await readConfig();

  const { url, videoStream, audioStream, proxy } = options;

  const cacheKey = keyOf(url);

  const existing = conf.entries[cacheKey];
  if (existing) {
    try {
      await fs.access(existing.localPath);
      const stat = await fs.stat(existing.localPath);
      return {
        localPath: existing.localPath,
        cached: true,
        fileSize: stat.size,
      };
    } catch {
      delete conf.entries[cacheKey];
      await writeConfig(conf);
    }
  }

  sendProgress({
    requestId,
    stage: "downloading",
    progress: 0,
    message: "开始下载视频...",
  });

  try {
    const { outputPath, fileSize } = await YtDlpService.downloadVideo({
      url,
      videoFormatId: videoStream.id,
      audioFormatId: audioStream.id,
      outputDir: dir,
      basename: cacheKey,
      targetExt: "mp4",
      proxy,
      onProgress: (progress) => relayDownloadProgress(progress, requestId),
    });

    sendProgress({
      requestId,
      stage: "completed",
      progress: 100,
      message: "下载完成",
    });

    finalizeEntry(conf, cacheKey, url, outputPath, fileSize);
    return { localPath: outputPath, cached: false, fileSize };
  } catch (err) {
    log.error(
      `[YouTube] yt-dlp 下载失败: ${err instanceof Error ? err.stack || err.message : String(err)}`,
    );
    const errMsg = err instanceof Error ? err.message : String(err);
    const isAbort = /aborted|AbortError|The user aborted a request/i.test(
      errMsg,
    );
    sendProgress({
      requestId,
      stage: "error",
      progress: 0,
      message: isAbort
        ? "网络超时，请检查代理或稍后再试"
        : `下载失败：${errMsg}`,
    });
    throw err;
  }
}

function relayDownloadProgress(
  progress: YtDlpDownloadProgress,
  requestId: number,
) {
  if (progress.stage === "downloading") {
    sendProgress({
      requestId,
      stage: "downloading",
      progress: progress.percent,
      message: progress.message || "正在下载...",
      downloaded: progress.downloadedBytes,
      total: progress.totalBytes,
      type: progress.type,
      videoDownloaded:
        progress.type === "video" ? progress.downloadedBytes : undefined,
      videoTotal: progress.type === "video" ? progress.totalBytes : undefined,
      audioDownloaded:
        progress.type === "audio" ? progress.downloadedBytes : undefined,
      audioTotal: progress.type === "audio" ? progress.totalBytes : undefined,
    });
    return;
  }

  if (progress.stage === "merging") {
    sendProgress({
      requestId,
      stage: "merging",
      progress: progress.percent,
      message: progress.message || "正在合并音视频...",
    });
  }
}

export default { init };

async function finalizeEntry(
  conf: any,
  key: string,
  url: string,
  localPath: string,
  fileSize: number,
) {
  conf.entries[key] = {
    url,
    title: url,
    localPath,
    fileSize,
    createdAt: new Date().toISOString(),
    lastAccessed: new Date().toISOString(),
  };
  conf.totalSize = (conf.totalSize || 0) + fileSize;
  await writeConfig(conf);
}
