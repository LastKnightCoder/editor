import { ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import log from "electron-log";
import PathUtil from "../utils/PathUtil";

interface RemoteImageCacheEntry {
  id: string;
  url: string;
  localPath: string;
  fileName: string;
  fileSize: number;
  title?: string;
  createdAt: string;
  lastAccessed: string;
}

interface RemoteImageCacheConfig {
  entries: Record<string, RemoteImageCacheEntry>;
}

const CACHE_FILE = "remote-image-cache.json";
const REMOTE_RESOURCE_MAP = "remote_local_map.json";

const getCacheFilePath = () => path.join(PathUtil.getAppDir(), CACHE_FILE);
const getResourceMapPath = () =>
  path.join(PathUtil.getAppDir(), REMOTE_RESOURCE_MAP);

const resolveLocalPath = (target: string) => {
  if (target.startsWith("~")) {
    return path.join(PathUtil.getHomeDir(), target.slice(1));
  }
  return target;
};

const keyOf = (url: string) =>
  crypto.createHash("md5").update(url).digest("hex");

const readConfig = async (): Promise<RemoteImageCacheConfig> => {
  try {
    const text = await fs.readFile(getCacheFilePath(), "utf-8");
    const data = JSON.parse(text) as RemoteImageCacheConfig;
    return data.entries ? data : { entries: {} };
  } catch {
    return { entries: {} };
  }
};

const writeConfig = async (config: RemoteImageCacheConfig) => {
  const filePath = getCacheFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(config, null, 2), "utf-8");
};

const removeRemoteResourceMapping = async (url: string) => {
  try {
    const configPath = getResourceMapPath();
    const text = await fs.readFile(configPath, "utf-8");
    const map = JSON.parse(text) as Record<string, string>;
    if (map[url]) {
      delete map[url];
      await fs.writeFile(configPath, JSON.stringify(map));
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      log.warn(
        "[RemoteImageCache] removeRemoteResourceMapping failed",
        error instanceof Error ? error.message : error,
      );
    }
  }
};

const ensureEntry = async (entry: RemoteImageCacheEntry) => {
  try {
    await fs.access(entry.localPath);
    return entry;
  } catch {
    return null;
  }
};

const init = async () => {
  ipcMain.handle(
    "remote-image-cache:add",
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
      const config = await readConfig();
      const id = keyOf(url);
      const now = new Date().toISOString();
      const existing = config.entries[id];
      config.entries[id] = {
        id,
        url,
        localPath: resolvedPath,
        fileName: path.basename(resolvedPath),
        fileSize: stat.size,
        title: title || existing?.title || path.basename(resolvedPath),
        createdAt: existing?.createdAt ?? now,
        lastAccessed: now,
      };
      await writeConfig(config);
      return config.entries[id];
    },
  );

  ipcMain.handle("remote-image-cache:list", async () => {
    const config = await readConfig();
    const result: RemoteImageCacheEntry[] = [];
    let changed = false;
    for (const entry of Object.values(config.entries)) {
      const ensured = await ensureEntry(entry);
      if (ensured) {
        result.push(ensured);
      } else {
        delete config.entries[entry.id];
        await removeRemoteResourceMapping(entry.url);
        changed = true;
      }
    }
    if (changed) {
      await writeConfig(config);
    }
    return result.sort(
      (a, b) =>
        new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime(),
    );
  });

  ipcMain.handle(
    "remote-image-cache:delete",
    async (_event, { id }: { id: string }) => {
      const config = await readConfig();
      const entry = config.entries[id];
      if (!entry) {
        return false;
      }
      try {
        await fs.unlink(entry.localPath);
      } catch (error) {
        log.warn(
          "[RemoteImageCache] delete file failed",
          error instanceof Error ? error.message : error,
        );
      }
      delete config.entries[id];
      await writeConfig(config);
      await removeRemoteResourceMapping(entry.url);
      return true;
    },
  );

  ipcMain.handle("remote-image-cache:clear", async () => {
    const config = await readConfig();
    for (const entry of Object.values(config.entries)) {
      try {
        await fs.unlink(entry.localPath);
      } catch (error) {
        log.warn(
          "[RemoteImageCache] clear unlink failed",
          error instanceof Error ? error.message : error,
        );
      }
      await removeRemoteResourceMapping(entry.url);
    }
    await writeConfig({ entries: {} });
  });
};

export default { init };
