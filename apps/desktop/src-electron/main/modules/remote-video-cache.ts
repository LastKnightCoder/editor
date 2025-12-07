import { ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import log from "electron-log";
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

const CACHE_FILE = "remote-video-cache.json";
const REMOTE_RESOURCE_MAP = "remote_local_map.json";

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
};

export default { init };
