import { RemoteVideoFailure, type RemoteVideoResponse } from "../../../shared/remote-video-failure";
import type { MediaProgressSemantic } from "../../../shared/media-progress";
import { ipcMain, WebContents } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import log from "electron-log";
import fetch from "node-fetch";
import PathUtil from "../utils/PathUtil";

interface RemoteVideoCacheEntry {
  id: string;
  url: string;
  localPath: string;
  fileName: string;
  fileSize: number;
  title?: string;
  createdAt: string;
  lastAccessed: string;
}

interface RemoteVideoCacheConfig {
  entries: Record<string, RemoteVideoCacheEntry>;
}

interface RemoteVideoProgressEvent extends MediaProgressSemantic {
  requestId: number;
  stage: "downloading" | "completed" | "error";
  progress: number;
  message: string;
  downloaded?: number;
  total?: number;
}

let requestCounter = 0;
const activeSenders = new Map<number, WebContents>();

const CACHE_FILE = "remote-video-cache.json";
const REMOTE_RESOURCE_MAP = "remote_local_map.json";
const REMOTE_VIDEO_CACHE_DIR = "remote-video-cache";

const getCacheFilePath = () => path.join(PathUtil.getAppDir(), CACHE_FILE);
const getResourceMapPath = () => path.join(PathUtil.getAppDir(), REMOTE_RESOURCE_MAP);

async function readCacheConfig(): Promise<RemoteVideoCacheConfig> {
  const filePath = getCacheFilePath();
  try {
    const text = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(text) as RemoteVideoCacheConfig;
    if (!data.entries) {
      return { entries: {} };
    }
    return data;
  } catch {
    return { entries: {} };
  }
}

async function writeCacheConfig(config: RemoteVideoCacheConfig) {
  const filePath = getCacheFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(config, null, 2));
}

const resolveLocalPath = (targetPath: string) => {
  if (targetPath.startsWith("~")) {
    return path.join(PathUtil.getHomeDir(), targetPath.slice(1));
  }
  return targetPath;
};

const keyOf = (url: string) => crypto.createHash("md5").update(url).digest("hex");

async function removeRemoteResourceMapping(url: string) {
  try {
    const configPath = getResourceMapPath();
    const text = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(text) as Record<string, string>;
    if (config[url]) {
      delete config[url];
      await fs.writeFile(configPath, JSON.stringify(config));
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return;
    }
    log.warn(
      "[RemoteVideoCache] removeRemoteResourceMapping failed",
      error instanceof Error ? error.message : error
    );
  }
}

async function ensureEntry(entry: RemoteVideoCacheEntry): Promise<RemoteVideoCacheEntry | null> {
  try {
    await fs.access(entry.localPath);
    return entry;
  } catch {
    return null;
  }
}

function sendProgressEvent(event: RemoteVideoProgressEvent): void {
  const sender = activeSenders.get(event.requestId);
  if (sender && !sender.isDestroyed()) {
    sender.send("remote-video-cache-progress", event);
  }
}

function getNextRequestId(): number {
  return ++requestCounter;
}

async function getCacheDir(): Promise<string> {
  const editorDir = PathUtil.getAppDir();
  const cacheDir = path.join(editorDir, REMOTE_VIDEO_CACHE_DIR);

  try {
    await fs.access(cacheDir);
  } catch {
    await fs.mkdir(cacheDir, { recursive: true });
  }

  return cacheDir;
}

function getFileExtension(url: string): string {
  let pathname = url;
  try {
    const urlObj = new URL(url);
    pathname = urlObj.pathname;
  } catch {
    // 不是合法 URL 时按普通路径处理
  }

  const normalized = pathname.replace(/\\/g, "/");
  const lastSegment = normalized.split("/").pop() || normalized;
  const dotIndex = lastSegment.lastIndexOf(".");
  if (dotIndex === -1 || dotIndex === lastSegment.length - 1) {
    return "";
  }
  return lastSegment.slice(dotIndex + 1);
}

async function downloadFileWithProgress(
  url: string,
  outputPath: string,
  requestId?: number
): Promise<number> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new RemoteVideoFailure("http", { status: response.status });
  }

  const totalSize = parseInt(response.headers.get("content-length") || "0");
  let downloadedSize = 0;

  const fileHandle = await fs.open(outputPath, "w");
  const writer = fileHandle.createWriteStream();

  return new Promise((resolve, reject) => {
    response.body?.on("data", (chunk: Buffer) => {
      downloadedSize += chunk.length;
      writer.write(chunk);

      if (requestId) {
        const percent = totalSize > 0 ? (downloadedSize / totalSize) * 100 : 0;
        sendProgressEvent({
          requestId,
          stage: "downloading",
          progress: percent,
          message: `Downloading video... ${percent.toFixed(1)}%`,
          code: "video.remote.downloading",
          params: { percent },
          downloaded: downloadedSize,
          total: totalSize,
        });
      }
    });

    response.body?.on("end", async () => {
      await writer.end();
      await fileHandle.close();
      resolve(downloadedSize);
    });

    response.body?.on("error", async error => {
      await writer.end();
      await fileHandle.close();
      reject(error);
    });
  });
}

async function cacheRemoteVideo(
  url: string,
  fileName?: string,
  requestId?: number
): Promise<{ localPath: string; fileSize: number; cached: boolean }> {
  const id = keyOf(url);
  const config = await readCacheConfig();

  const existing = config.entries[id];
  if (existing) {
    const ensured = await ensureEntry(existing);
    if (ensured) {
      ensured.lastAccessed = new Date().toISOString();
      await writeCacheConfig(config);

      return {
        localPath: ensured.localPath,
        fileSize: ensured.fileSize,
        cached: true,
      };
    } else {
      // 本地文件已丢失，清掉失效条目
      delete config.entries[id];
      await writeCacheConfig(config);
    }
  }

  const cacheDir = await getCacheDir();
  const ext = getFileExtension(url) || "mp4";
  const outputFileName = `${id}.${ext}`;
  const outputPath = path.join(cacheDir, outputFileName);

  try {
    log.info(`[RemoteVideoCache] Starting download: ${url}`);

    if (requestId) {
      sendProgressEvent({
        requestId,
        stage: "downloading",
        progress: 0,
        message: "Starting video download...",
        code: "video.remote.start",
        downloaded: 0,
        total: 0,
      });
    }

    const fileSize = await downloadFileWithProgress(url, outputPath, requestId);

    const now = new Date().toISOString();
    const newEntry: RemoteVideoCacheEntry = {
      id,
      url,
      localPath: outputPath,
      fileName: fileName || outputFileName,
      fileSize,
      title: fileName,
      createdAt: now,
      lastAccessed: now,
    };

    config.entries[id] = newEntry;
    await writeCacheConfig(config);

    log.info(`[RemoteVideoCache] Download completed: ${outputPath}`);

    if (requestId) {
      sendProgressEvent({
        requestId,
        stage: "completed",
        progress: 100,
        message: `Download completed (${(fileSize / 1024 / 1024).toFixed(2)}MB)`,
        code: "video.remote.completed",
        params: { fileSize },
        downloaded: fileSize,
        total: fileSize,
      });
    }

    return {
      localPath: outputPath,
      fileSize,
      cached: false,
    };
  } catch (error) {
    if (requestId) {
      sendProgressEvent({
        requestId,
        stage: "error",
        progress: 0,
        message: `Download failed: ${error instanceof Error ? error.message : String(error)}`,
        ...(error instanceof RemoteVideoFailure &&
        error.code === "http" &&
        typeof error.params.status === "number"
          ? {
              code: "video.remote.error.http",
              params: { status: error.params.status },
            }
          : {
              code: "video.remote.error",
              params: { error: error instanceof Error ? error.message : String(error) },
            }),
      });
    }

    // 清掉半成品文件
    try {
      await fs.unlink(outputPath);
    } catch {
      // 清理失败无需处理
    }

    throw error;
  }
}

const init = async () => {
  ipcMain.handle(
    "remote-video-cache:add",
    async (
      _event,
      { url, localPath, title }: { url: string; localPath: string; title?: string }
    ): Promise<RemoteVideoResponse<RemoteVideoCacheEntry>> => {
      try {
        if (!url || !localPath) {
          throw new RemoteVideoFailure("arguments");
        }
        const resolvedPath = resolveLocalPath(localPath);
        const stat = await fs.stat(resolvedPath);
        const id = keyOf(url);
        const config = await readCacheConfig();
        const now = new Date().toISOString();
        const existing = config.entries[id];
        const nextEntry: RemoteVideoCacheEntry = {
          id,
          url,
          localPath: resolvedPath,
          fileName: path.basename(resolvedPath),
          fileSize: stat.size,
          title: title || existing?.title || path.basename(resolvedPath),
          createdAt: existing?.createdAt ?? now,
          lastAccessed: now,
        };
        config.entries[id] = nextEntry;
        await writeCacheConfig(config);
        return { ok: true, value: nextEntry };
      } catch (error) {
        if (error instanceof RemoteVideoFailure) return { ok: false, failure: error.toData() };
        throw error;
      }
    }
  );

  ipcMain.handle("remote-video-cache:list", async () => {
    const config = await readCacheConfig();
    const entries = Object.values(config.entries);
    const validEntries: RemoteVideoCacheEntry[] = [];
    let changed = false;
    for (const entry of entries) {
      const ensured = await ensureEntry(entry);
      if (ensured) {
        validEntries.push(ensured);
      } else {
        delete config.entries[entry.id];
        await removeRemoteResourceMapping(entry.url);
        changed = true;
      }
    }
    if (changed) {
      await writeCacheConfig(config);
    }
    return validEntries.sort(
      (a, b) => new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime()
    );
  });

  ipcMain.handle("remote-video-cache:delete", async (_event, { id }: { id: string }) => {
    const config = await readCacheConfig();
    const entry = config.entries[id];
    if (!entry) {
      return false;
    }
    try {
      await fs.unlink(entry.localPath);
    } catch (error) {
      log.warn(
        "[RemoteVideoCache] delete file failed",
        error instanceof Error ? error.message : error
      );
    }
    delete config.entries[id];
    await writeCacheConfig(config);
    await removeRemoteResourceMapping(entry.url);
    return true;
  });

  ipcMain.handle("remote-video-cache:clear", async () => {
    const config = await readCacheConfig();
    const entries = Object.values(config.entries);
    for (const entry of entries) {
      try {
        await fs.unlink(entry.localPath);
      } catch (error) {
        log.warn(
          "[RemoteVideoCache] clear unlink failed",
          error instanceof Error ? error.message : error
        );
      }
      await removeRemoteResourceMapping(entry.url);
    }
    await writeCacheConfig({ entries: {} });
  });

  ipcMain.handle(
    "remote-video-cache:download-with-progress",
    async (event, { url, fileName }: { url: string; fileName?: string }) => {
      const requestId = getNextRequestId();
      activeSenders.set(requestId, event.sender);

      try {
        const result = await cacheRemoteVideo(url, fileName, requestId);
        activeSenders.delete(requestId);
        return { ok: true, value: { ...result, requestId } };
      } catch (error) {
        activeSenders.delete(requestId);
        if (error instanceof RemoteVideoFailure) return { ok: false, failure: error.toData() };
        throw error;
      }
    }
  );

  ipcMain.handle("remote-video-cache:get-status", async (_event, { url }: { url: string }) => {
    const id = keyOf(url);
    const config = await readCacheConfig();
    const entry = config.entries[id];

    if (!entry) {
      return null;
    }

    const ensured = await ensureEntry(entry);
    if (!ensured) {
      delete config.entries[id];
      await writeCacheConfig(config);
      return null;
    }

    return {
      cached: true,
      localPath: ensured.localPath,
      fileSize: ensured.fileSize,
    };
  });
};

export default { init };
