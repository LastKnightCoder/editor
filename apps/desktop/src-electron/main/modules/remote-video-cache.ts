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

interface RemoteVideoProgressEvent {
  requestId: number;
  stage: "downloading" | "completed" | "error";
  progress: number;
  message: string;
  downloaded?: number;
  total?: number;
}

// Progress management
let requestCounter = 0;
const activeSenders = new Map<number, WebContents>();

const CACHE_FILE = "remote-video-cache.json";
const REMOTE_RESOURCE_MAP = "remote_local_map.json";
const REMOTE_VIDEO_CACHE_DIR = "remote-video-cache";

const getCacheFilePath = () => path.join(PathUtil.getAppDir(), CACHE_FILE);
const getResourceMapPath = () =>
  path.join(PathUtil.getAppDir(), REMOTE_RESOURCE_MAP);

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

const keyOf = (url: string) =>
  crypto.createHash("md5").update(url).digest("hex");

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
      error instanceof Error ? error.message : error,
    );
  }
}

async function ensureEntry(
  entry: RemoteVideoCacheEntry,
): Promise<RemoteVideoCacheEntry | null> {
  try {
    await fs.access(entry.localPath);
    return entry;
  } catch {
    return null;
  }
}

/**
 * Send progress event to renderer
 */
function sendProgressEvent(event: RemoteVideoProgressEvent): void {
  const sender = activeSenders.get(event.requestId);
  if (sender && !sender.isDestroyed()) {
    sender.send("remote-video-cache-progress", event);
  }
}

/**
 * Get next request ID
 */
function getNextRequestId(): number {
  return ++requestCounter;
}

/**
 * Get cache directory path
 */
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

/**
 * Get file extension from URL
 */
function getFileExtension(url: string): string {
  let pathname = url;
  try {
    const urlObj = new URL(url);
    pathname = urlObj.pathname;
  } catch {
    // ignore parse error, treat as plain path
  }

  const normalized = pathname.replace(/\\/g, "/");
  const lastSegment = normalized.split("/").pop() || normalized;
  const dotIndex = lastSegment.lastIndexOf(".");
  if (dotIndex === -1 || dotIndex === lastSegment.length - 1) {
    return "";
  }
  return lastSegment.slice(dotIndex + 1);
}

/**
 * Download file with progress
 */
async function downloadFileWithProgress(
  url: string,
  outputPath: string,
  requestId?: number,
): Promise<number> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }

  const totalSize = parseInt(response.headers.get("content-length") || "0");
  let downloadedSize = 0;

  const fileHandle = await fs.open(outputPath, "w");
  const writer = fileHandle.createWriteStream();

  return new Promise((resolve, reject) => {
    response.body?.on("data", (chunk: Buffer) => {
      downloadedSize += chunk.length;
      writer.write(chunk);

      // Send progress event
      if (requestId) {
        const percent = totalSize > 0 ? (downloadedSize / totalSize) * 100 : 0;
        sendProgressEvent({
          requestId,
          stage: "downloading",
          progress: percent,
          message: `Downloading video... ${percent.toFixed(1)}%`,
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

    response.body?.on("error", async (error) => {
      await writer.end();
      await fileHandle.close();
      reject(error);
    });
  });
}

/**
 * Cache remote video with progress
 */
async function cacheRemoteVideo(
  url: string,
  fileName?: string,
  requestId?: number,
): Promise<{ localPath: string; fileSize: number; cached: boolean }> {
  const id = keyOf(url);
  const config = await readCacheConfig();

  // Check if already cached
  const existing = config.entries[id];
  if (existing) {
    const ensured = await ensureEntry(existing);
    if (ensured) {
      // Update last accessed time
      ensured.lastAccessed = new Date().toISOString();
      await writeCacheConfig(config);

      return {
        localPath: ensured.localPath,
        fileSize: ensured.fileSize,
        cached: true,
      };
    } else {
      // File doesn't exist, remove from config
      delete config.entries[id];
      await writeCacheConfig(config);
    }
  }

  // Download the video
  const cacheDir = await getCacheDir();
  const ext = getFileExtension(url) || "mp4";
  const outputFileName = `${id}.${ext}`;
  const outputPath = path.join(cacheDir, outputFileName);

  try {
    log.info(`[RemoteVideoCache] Starting download: ${url}`);

    // Send start event
    if (requestId) {
      sendProgressEvent({
        requestId,
        stage: "downloading",
        progress: 0,
        message: "Starting video download...",
        downloaded: 0,
        total: 0,
      });
    }

    const fileSize = await downloadFileWithProgress(url, outputPath, requestId);

    // Update config
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

    // Send completion event
    if (requestId) {
      sendProgressEvent({
        requestId,
        stage: "completed",
        progress: 100,
        message: `Download completed (${(fileSize / 1024 / 1024).toFixed(2)}MB)`,
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
    // Send error event
    if (requestId) {
      sendProgressEvent({
        requestId,
        stage: "error",
        progress: 0,
        message: `Download failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }

    // Cleanup on error
    try {
      await fs.unlink(outputPath);
    } catch {
      // Ignore cleanup errors
    }

    throw error;
  }
}

const init = async () => {
  ipcMain.handle(
    "remote-video-cache:add",
    async (
      _event,
      {
        url,
        localPath,
        title,
      }: { url: string; localPath: string; title?: string },
    ) => {
      if (!url || !localPath) {
        throw new Error("url and localPath are required");
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
      return nextEntry;
    },
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
      (a, b) =>
        new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime(),
    );
  });

  ipcMain.handle(
    "remote-video-cache:delete",
    async (_event, { id }: { id: string }) => {
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
          error instanceof Error ? error.message : error,
        );
      }
      delete config.entries[id];
      await writeCacheConfig(config);
      await removeRemoteResourceMapping(entry.url);
      return true;
    },
  );

  ipcMain.handle("remote-video-cache:clear", async () => {
    const config = await readCacheConfig();
    const entries = Object.values(config.entries);
    for (const entry of entries) {
      try {
        await fs.unlink(entry.localPath);
      } catch (error) {
        log.warn(
          "[RemoteVideoCache] clear unlink failed",
          error instanceof Error ? error.message : error,
        );
      }
      await removeRemoteResourceMapping(entry.url);
    }
    await writeCacheConfig({ entries: {} });
  });

  // New handler for downloading with progress
  ipcMain.handle(
    "remote-video-cache:download-with-progress",
    async (event, { url, fileName }: { url: string; fileName?: string }) => {
      const requestId = getNextRequestId();
      activeSenders.set(requestId, event.sender);

      try {
        const result = await cacheRemoteVideo(url, fileName, requestId);
        activeSenders.delete(requestId);
        return { ...result, requestId };
      } catch (error) {
        activeSenders.delete(requestId);
        throw error;
      }
    },
  );

  // Handler to check cache status
  ipcMain.handle(
    "remote-video-cache:get-status",
    async (_event, { url }: { url: string }) => {
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
    },
  );
};

export default { init };
