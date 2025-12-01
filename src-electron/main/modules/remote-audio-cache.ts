import { ipcMain } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import log from "electron-log";
import PathUtil from "../utils/PathUtil";

interface RemoteAudioCacheEntry {
  id: string;
  url: string;
  localPath: string;
  fileName: string;
  fileSize: number;
  createdAt: string;
  lastAccessed: string;
}

interface RemoteAudioCacheConfig {
  entries: Record<string, RemoteAudioCacheEntry>;
}

const CACHE_FILE = "remote-audio-cache.json";
const REMOTE_RESOURCE_MAP = "remote_local_map.json";

const getCacheFilePath = () => path.join(PathUtil.getAppDir(), CACHE_FILE);
const getResourceMapPath = () =>
  path.join(PathUtil.getAppDir(), REMOTE_RESOURCE_MAP);

const resolvePath = (target: string) => {
  if (target.startsWith("~")) {
    return path.join(PathUtil.getHomeDir(), target.slice(1));
  }
  return target;
};

const keyOf = (url: string) =>
  crypto.createHash("md5").update(url).digest("hex");

const readConfig = async (): Promise<RemoteAudioCacheConfig> => {
  try {
    const text = await fs.readFile(getCacheFilePath(), "utf-8");
    const data = JSON.parse(text) as RemoteAudioCacheConfig;
    return data.entries ? data : { entries: {} };
  } catch {
    return { entries: {} };
  }
};

const writeConfig = async (config: RemoteAudioCacheConfig) => {
  const filePath = getCacheFilePath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(config, null, 2), "utf-8");
};

const removeResourceMapping = async (url: string) => {
  try {
    const configPath = getResourceMapPath();
    const text = await fs.readFile(configPath, "utf-8");
    const data = JSON.parse(text) as Record<string, string>;
    if (data[url]) {
      delete data[url];
      await fs.writeFile(configPath, JSON.stringify(data));
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "ENOENT") {
      log.warn(
        "[RemoteAudioCache] removeResourceMapping failed",
        error instanceof Error ? error.message : error,
      );
    }
  }
};

const ensureEntry = async (entry: RemoteAudioCacheEntry) => {
  try {
    await fs.access(entry.localPath);
    return entry;
  } catch {
    return null;
  }
};

const init = async () => {
  ipcMain.handle(
    "remote-audio-cache:add",
    async (_event, { url, localPath }: { url: string; localPath: string }) => {
      if (!url || !localPath) {
        throw new Error("url and localPath are required");
      }
      const resolvedPath = resolvePath(localPath);
      const stat = await fs.stat(resolvedPath);
      const config = await readConfig();
      const id = keyOf(url);
      const now = new Date().toISOString();
      config.entries[id] = {
        id,
        url,
        localPath: resolvedPath,
        fileName: path.basename(resolvedPath),
        fileSize: stat.size,
        createdAt: config.entries[id]?.createdAt ?? now,
        lastAccessed: now,
      };
      await writeConfig(config);
      return config.entries[id];
    },
  );

  ipcMain.handle("remote-audio-cache:list", async () => {
    const config = await readConfig();
    const entries: RemoteAudioCacheEntry[] = [];
    let changed = false;
    for (const entry of Object.values(config.entries)) {
      const ensured = await ensureEntry(entry);
      if (ensured) {
        entries.push(ensured);
      } else {
        delete config.entries[entry.id];
        await removeResourceMapping(entry.url);
        changed = true;
      }
    }
    if (changed) {
      await writeConfig(config);
    }
    return entries.sort(
      (a, b) =>
        new Date(b.lastAccessed).getTime() - new Date(a.lastAccessed).getTime(),
    );
  });

  ipcMain.handle(
    "remote-audio-cache:delete",
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
          "[RemoteAudioCache] unlink failed",
          error instanceof Error ? error.message : error,
        );
      }
      delete config.entries[id];
      await writeConfig(config);
      await removeResourceMapping(entry.url);
      return true;
    },
  );

  ipcMain.handle("remote-audio-cache:clear", async () => {
    const config = await readConfig();
    for (const entry of Object.values(config.entries)) {
      try {
        await fs.unlink(entry.localPath);
      } catch (error) {
        log.warn(
          "[RemoteAudioCache] clear unlink failed",
          error instanceof Error ? error.message : error,
        );
      }
      await removeResourceMapping(entry.url);
    }
    await writeConfig({ entries: {} });
  });
};

export default { init };
