import { ipcMain, WebContents } from "electron";
import * as fs from "fs/promises";
import * as path from "path";
import fetch from "node-fetch";
import PathUtil from "../utils/PathUtil";
import log from "electron-log";
import { Module } from "../types/module";

// 缓存配置
const NOTION_CACHE_DIR = "notion-cache";
const NOTION_CACHE_CONFIG = "notion-cache-config.json";

// 进度管理
let requestCounter = 0;
const activeSenders = new Map<number, WebContents>();

// 类型定义
interface NotionCacheOptions {
  blockId: string;
  videoUrl: string;
  title?: string;
  requestId?: number;
}

interface NotionCacheResult {
  localPath: string;
  cached: boolean;
  fileSize: number;
}

interface NotionCacheEntry {
  blockId: string;
  title: string;
  localPath: string;
  fileSize: number;
  createdAt: string;
  lastAccessed: string;
}

interface NotionCacheConfig {
  entries: Record<string, NotionCacheEntry>;
  totalSize: number;
  lastCleanup: string;
}

interface NotionCacheProgress {
  requestId?: number;
  stage: "downloading" | "completed" | "error";
  progress: number;
  processed?: number;
  message: string;
  downloaded?: number;
  total?: number;
}

class NotionCacheModule implements Module {
  name: string;

  constructor() {
    this.name = "notion-cache";
  }

  async init() {
    log.info("初始化 Notion 缓存模块");

    ipcMain.handle("cache_notion_video", async (event, { options }) => {
      const requestId = ++requestCounter;
      activeSenders.set(requestId, event.sender);
      options.requestId = requestId;

      try {
        const result = await this.cacheVideo(options, event.sender);
        return result;
      } finally {
        activeSenders.delete(requestId);
      }
    });

    ipcMain.handle("get_notion_cache_status", async (_event, { blockId }) => {
      return this.getCacheStatus(blockId);
    });

    ipcMain.handle("clear_notion_cache", async () => {
      return this.clearCache();
    });

    ipcMain.handle("delete_notion_cache", async (_event, { blockId }) => {
      return this.deleteCache(blockId);
    });

    ipcMain.handle("get_notion_cache_size", async () => {
      return this.getCacheSize();
    });

    ipcMain.handle("list_notion_cache", async () => {
      return this.listCache();
    });
  }

  private async ensureCacheDir(): Promise<string> {
    const appDir = PathUtil.getAppDir();
    const cacheDir = path.join(appDir, NOTION_CACHE_DIR);

    try {
      await fs.access(cacheDir);
    } catch {
      await fs.mkdir(cacheDir, { recursive: true });
    }

    return cacheDir;
  }

  private async readConfig(): Promise<NotionCacheConfig> {
    const appDir = PathUtil.getAppDir();
    const configPath = path.join(appDir, NOTION_CACHE_CONFIG);

    try {
      const content = await fs.readFile(configPath, "utf-8");
      return JSON.parse(content) as NotionCacheConfig;
    } catch {
      return {
        entries: {},
        totalSize: 0,
        lastCleanup: new Date().toISOString(),
      };
    }
  }

  private async writeConfig(config: NotionCacheConfig): Promise<void> {
    const appDir = PathUtil.getAppDir();
    const configPath = path.join(appDir, NOTION_CACHE_CONFIG);
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
  }

  private getCacheKey(blockId: string): string {
    // 使用格式化后的 blockId 作为键
    return blockId.replace(/-/g, "");
  }

  private sendProgress(
    sender: WebContents,
    progress: NotionCacheProgress,
  ): void {
    if (sender && !sender.isDestroyed()) {
      sender.send("notion-cache-progress", progress);
    }
  }

  async cacheVideo(
    options: NotionCacheOptions,
    sender: WebContents,
  ): Promise<NotionCacheResult> {
    const { blockId, videoUrl, title, requestId } = options;
    const cacheKey = this.getCacheKey(blockId);

    log.info(`开始缓存 Notion 视频: ${blockId}`);

    // 检查是否已缓存
    const existingCache = await this.getCacheStatus(blockId);
    if (existingCache) {
      log.info(`使用已缓存的视频: ${blockId}`);
      return existingCache;
    }

    const cacheDir = await this.ensureCacheDir();
    const fileName = `${cacheKey}.mp4`;
    const localPath = path.join(cacheDir, fileName);

    try {
      // 发送开始下载进度
      this.sendProgress(sender, {
        requestId,
        stage: "downloading",
        progress: 0,
        message: "开始下载 Notion 视频...",
        downloaded: 0,
        total: 0,
      });

      // 下载视频
      const response = await fetch(videoUrl);

      if (!response.ok) {
        throw new Error(`下载失败: ${response.statusText}`);
      }

      const totalSize = parseInt(
        response.headers.get("content-length") || "0",
        10,
      );
      let downloaded = 0;

      // 创建写入流
      const fileHandle = await fs.open(localPath, "w");
      const writeStream = fileHandle.createWriteStream();

      // 使用 Node.js 流来下载
      if (response.body) {
        for await (const chunk of response.body as any) {
          downloaded += chunk.length;
          writeStream.write(chunk);

          const progress = totalSize > 0 ? (downloaded / totalSize) * 100 : 0;

          this.sendProgress(sender, {
            requestId,
            stage: "downloading",
            progress,
            message: `下载中... ${(downloaded / 1024 / 1024).toFixed(2)}MB / ${(totalSize / 1024 / 1024).toFixed(2)}MB`,
            downloaded,
            total: totalSize,
          });
        }
      }

      writeStream.end();
      await fileHandle.close();

      // 获取文件大小
      const stats = await fs.stat(localPath);
      const fileSize = stats.size;

      // 更新配置
      const config = await this.readConfig();
      config.entries[cacheKey] = {
        blockId,
        title: title || blockId,
        localPath,
        fileSize,
        createdAt: new Date().toISOString(),
        lastAccessed: new Date().toISOString(),
      };
      config.totalSize = (config.totalSize || 0) + fileSize;
      await this.writeConfig(config);

      // 发送完成进度
      this.sendProgress(sender, {
        requestId,
        stage: "completed",
        progress: 100,
        message: `下载完成 (${(fileSize / 1024 / 1024).toFixed(2)}MB)`,
        downloaded: fileSize,
        total: fileSize,
      });

      log.info(`Notion 视频缓存完成: ${blockId}, 大小: ${fileSize} 字节`);

      return {
        localPath,
        cached: false,
        fileSize,
      };
    } catch (error) {
      log.error(`缓存 Notion 视频失败: ${blockId}`, error);

      // 删除可能创建的不完整文件
      try {
        await fs.unlink(localPath);
      } catch {
        // 忽略删除失败的错误，文件可能不存在
      }

      this.sendProgress(sender, {
        requestId,
        stage: "error",
        progress: 0,
        message: `下载失败: ${error instanceof Error ? error.message : "未知错误"}`,
      });

      throw error;
    }
  }

  async getCacheStatus(blockId: string): Promise<NotionCacheResult | null> {
    const cacheKey = this.getCacheKey(blockId);
    const config = await this.readConfig();
    const entry = config.entries[cacheKey];

    if (!entry) {
      return null;
    }

    // 检查文件是否存在
    try {
      await fs.access(entry.localPath);

      // 更新最后访问时间
      entry.lastAccessed = new Date().toISOString();
      config.entries[cacheKey] = entry;
      await this.writeConfig(config);

      return {
        localPath: entry.localPath,
        cached: true,
        fileSize: entry.fileSize,
      };
    } catch {
      // 文件不存在，删除配置条目
      delete config.entries[cacheKey];
      config.totalSize = Math.max(0, (config.totalSize || 0) - entry.fileSize);
      await this.writeConfig(config);
      return null;
    }
  }

  async clearCache(): Promise<void> {
    const cacheDir = await this.ensureCacheDir();

    try {
      const files = await fs.readdir(cacheDir);
      for (const file of files) {
        await fs.unlink(path.join(cacheDir, file));
      }

      await this.writeConfig({
        entries: {},
        totalSize: 0,
        lastCleanup: new Date().toISOString(),
      });

      log.info("Notion 缓存已清空");
    } catch (error) {
      log.error("清空 Notion 缓存失败:", error);
      throw error;
    }
  }

  async deleteCache(blockId: string): Promise<boolean> {
    const cacheKey = this.getCacheKey(blockId);
    const config = await this.readConfig();
    const entry = config.entries[cacheKey];

    if (!entry) {
      return false;
    }

    try {
      await fs.unlink(entry.localPath);
      delete config.entries[cacheKey];
      config.totalSize = Math.max(0, (config.totalSize || 0) - entry.fileSize);
      await this.writeConfig(config);

      log.info(`删除 Notion 缓存: ${blockId}`);
      return true;
    } catch (error) {
      log.error(`删除 Notion 缓存失败: ${blockId}`, error);
      return false;
    }
  }

  async getCacheSize(): Promise<number> {
    const config = await this.readConfig();
    return config.totalSize || 0;
  }

  async listCache(): Promise<
    Array<{
      blockId: string;
      title: string;
      fileSize: number;
      createdAt: string;
      lastAccessed: string;
    }>
  > {
    const config = await this.readConfig();
    return Object.values(config.entries).map((entry) => ({
      blockId: entry.blockId,
      title: entry.title,
      fileSize: entry.fileSize,
      createdAt: entry.createdAt,
      lastAccessed: entry.lastAccessed,
    }));
  }
}

export default new NotionCacheModule();
