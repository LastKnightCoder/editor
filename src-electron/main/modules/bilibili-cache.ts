import { ipcMain, WebContents } from "electron";
import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";
import ffmpeg from "fluent-ffmpeg";
// import * as ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import fetch from "node-fetch";
import PathUtil from "../utils/PathUtil";

// 设置 FFmpeg 路径
// ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// 缓存配置
const BILIBILI_CACHE_DIR = "bilibili-cache";
const BILIBILI_CACHE_CONFIG = "bilibili-cache-config.json";

// 进度管理
let requestCounter = 0;
const activeSenders = new Map<number, WebContents>();

// 类型定义
interface BilibiliCacheOptions {
  videoUrl: string;
  audioUrl: string;
  bvid: string;
  cid: string;
  quality: number;
  title?: string;
  requestId?: number;
}

interface BilibiliCacheResult {
  localPath: string;
  cached: boolean;
  fileSize: number;
}

interface BilibiliCacheEntry {
  bvid: string;
  cid: string;
  quality: number;
  title: string;
  localPath: string;
  fileSize: number;
  createdAt: string;
  lastAccessed: string;
}

interface BilibiliCacheConfig {
  entries: Record<string, BilibiliCacheEntry>;
  totalSize: number;
  lastCleanup: string;
}

interface BilibiliProgressEvent {
  requestId: number;
  stage: "downloading" | "merging" | "completed" | "error";
  progress: number;
  message: string;
  videoDownloaded?: number;
  audioDownloaded?: number;
  videoTotal?: number;
  audioTotal?: number;
  totalSize?: number;
}

/**
 * 发送进度事件
 */
function sendProgressEvent(event: BilibiliProgressEvent): void {
  const sender = activeSenders.get(event.requestId);
  if (sender && !sender.isDestroyed()) {
    sender.send("bilibili-cache-progress", event);
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
  const cacheDir = path.join(editorDir, BILIBILI_CACHE_DIR);

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
  return path.join(editorDir, BILIBILI_CACHE_CONFIG);
}

/**
 * 读取缓存配置
 */
async function readCacheConfig(): Promise<BilibiliCacheConfig> {
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
async function writeCacheConfig(config: BilibiliCacheConfig): Promise<void> {
  const configPath = await getConfigPath();
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

/**
 * 生成缓存键
 */
function generateCacheKey(bvid: string, cid: string, quality: number): string {
  const content = `${bvid}-${cid}-${quality}`;
  return crypto.createHash("md5").update(content).digest("hex");
}

/**
 * 下载文件
 */
async function downloadFile(
  url: string,
  outputPath: string,
  onProgress?: (downloaded: number, total: number) => void,
  requestId?: number,
  downloadType?: "video" | "audio",
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

      // 发送进度事件
      if (requestId && downloadType) {
        const progressEvent: Partial<BilibiliProgressEvent> = {
          requestId,
          stage: "downloading",
          progress: totalSize > 0 ? (downloadedSize / totalSize) * 100 : 0,
          message: `正在下载${downloadType === "video" ? "视频" : "音频"}...`,
          totalSize,
        };

        if (downloadType === "video") {
          progressEvent.videoDownloaded = downloadedSize;
          progressEvent.videoTotal = totalSize;
        } else {
          progressEvent.audioDownloaded = downloadedSize;
          progressEvent.audioTotal = totalSize;
        }

        sendProgressEvent(progressEvent as BilibiliProgressEvent);
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
 * 使用 FFmpeg 合并音视频
 */
async function mergeAudioVideo(
  videoPath: string,
  audioPath: string,
  outputPath: string,
  onProgress?: (percent: number) => void,
  requestId?: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .input(audioPath)
      .outputOptions([
        "-c:v copy", // 不重新编码视频
        "-c:a aac", // 音频编码为 AAC
        "-shortest", // 使用较短的流长度
      ])
      .on("progress", (progress) => {
        const percent = progress.percent || 0;
        onProgress?.(percent);

        // 发送合并进度事件
        if (requestId) {
          sendProgressEvent({
            requestId,
            stage: "merging",
            progress: percent,
            message: `正在合并音视频... (${percent.toFixed(1)}%)`,
            totalSize: 0,
          });
        }
      })
      .on("end", () => {
        resolve();
      })
      .on("error", (error) => {
        reject(new Error(`FFmpeg 合并失败: ${error.message}`));
      })
      .save(outputPath);
  });
}

/**
 * 清理临时文件
 */
async function cleanupTempFiles(files: string[]): Promise<void> {
  for (const file of files) {
    try {
      await fs.unlink(file);
    } catch {
      // 忽略清理错误
    }
  }
}

/**
 * 缓存 Bilibili 视频
 */
async function cacheBilibiliVideo(
  options: BilibiliCacheOptions,
): Promise<BilibiliCacheResult> {
  const {
    videoUrl,
    audioUrl,
    bvid,
    cid,
    quality,
    title = "",
    requestId,
  } = options;

  // 检查是否已缓存
  const cacheKey = generateCacheKey(bvid, cid, quality);
  const config = await readCacheConfig();

  if (config.entries[cacheKey]) {
    const entry = config.entries[cacheKey];
    try {
      await fs.access(entry.localPath);
      // 更新访问时间
      entry.lastAccessed = new Date().toISOString();
      await writeCacheConfig(config);

      const stats = await fs.stat(entry.localPath);
      return {
        localPath: entry.localPath,
        cached: true,
        fileSize: stats.size,
      };
    } catch {
      // 文件不存在，删除配置记录
      delete config.entries[cacheKey];
      await writeCacheConfig(config);
    }
  }

  const cacheDir = await getCacheDir();
  const outputFileName = `${cacheKey}.mp4`;
  const outputPath = path.join(cacheDir, outputFileName);

  // 临时文件路径
  const tempVideoPath = path.join(cacheDir, `${cacheKey}_video.tmp`);
  const tempAudioPath = path.join(cacheDir, `${cacheKey}_audio.tmp`);

  try {
    console.log(`开始缓存 Bilibili 视频: ${bvid}-${cid}-${quality}`);

    // 发送开始下载事件
    if (requestId) {
      sendProgressEvent({
        requestId,
        stage: "downloading",
        progress: 0,
        message: "开始下载视频和音频...",
        videoDownloaded: 0,
        audioDownloaded: 0,
        totalSize: 0,
      });
    }

    // 并行下载音视频
    await Promise.all([
      downloadFile(
        videoUrl,
        tempVideoPath,
        (downloaded, total) => {
          console.log(
            `视频下载进度: ${((downloaded / total) * 100).toFixed(1)}%`,
          );
        },
        requestId,
        "video",
      ),
      downloadFile(
        audioUrl,
        tempAudioPath,
        (downloaded, total) => {
          console.log(
            `音频下载进度: ${((downloaded / total) * 100).toFixed(1)}%`,
          );
        },
        requestId,
        "audio",
      ),
    ]);

    console.log("下载完成，开始合并音视频...");

    // 合并音视频
    await mergeAudioVideo(
      tempVideoPath,
      tempAudioPath,
      outputPath,
      (percent) => {
        console.log(`合并进度: ${percent.toFixed(1)}%`);
      },
      requestId,
    );

    console.log("合并完成，清理临时文件...");

    // 清理临时文件
    await cleanupTempFiles([tempVideoPath, tempAudioPath]);

    // 获取文件大小
    const stats = await fs.stat(outputPath);

    // 更新配置
    const newEntry: BilibiliCacheEntry = {
      bvid,
      cid,
      quality,
      title,
      localPath: outputPath,
      fileSize: stats.size,
      createdAt: new Date().toISOString(),
      lastAccessed: new Date().toISOString(),
    };

    config.entries[cacheKey] = newEntry;
    config.totalSize += stats.size;
    await writeCacheConfig(config);

    console.log(`Bilibili 视频缓存完成: ${outputPath}`);

    // 发送完成事件
    if (requestId) {
      sendProgressEvent({
        requestId,
        stage: "completed",
        progress: 100,
        message: `下载完成 (${(stats.size / 1024 / 1024).toFixed(2)}MB)`,
        totalSize: stats.size,
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
        totalSize: 0,
      });
    }

    // 清理临时文件
    await cleanupTempFiles([tempVideoPath, tempAudioPath, outputPath]);
    throw error;
  }
}

/**
 * 获取缓存状态
 */
async function getBilibiliCacheStatus(
  bvid: string,
  cid: string,
  quality: number,
): Promise<BilibiliCacheResult | null> {
  const cacheKey = generateCacheKey(bvid, cid, quality);
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
    // 文件不存在，删除配置记录
    delete config.entries[cacheKey];
    await writeCacheConfig(config);
    return null;
  }
}

/**
 * 清理所有缓存
 */
async function clearBilibiliCache(): Promise<void> {
  const config = await readCacheConfig();

  // 删除所有缓存文件
  for (const entry of Object.values(config.entries)) {
    try {
      await fs.unlink(entry.localPath);
    } catch {
      // 忽略删除错误
    }
  }

  // 重置配置
  const newConfig: BilibiliCacheConfig = {
    entries: {},
    totalSize: 0,
    lastCleanup: new Date().toISOString(),
  };

  await writeCacheConfig(newConfig);
  console.log("Bilibili 缓存已清理");
}

/**
 * 删除特定缓存
 */
async function deleteBilibiliCache(
  bvid: string,
  cid: string,
  quality: number,
): Promise<boolean> {
  const cacheKey = generateCacheKey(bvid, cid, quality);
  const config = await readCacheConfig();

  const entry = config.entries[cacheKey];
  if (!entry) {
    return false;
  }

  try {
    await fs.unlink(entry.localPath);
    config.totalSize -= entry.fileSize;
    delete config.entries[cacheKey];
    await writeCacheConfig(config);
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取缓存大小
 */
async function getBilibiliCacheSize(): Promise<number> {
  const config = await readCacheConfig();
  return config.totalSize;
}

/**
 * 列出所有缓存
 */
async function listBilibiliCache(): Promise<BilibiliCacheEntry[]> {
  const config = await readCacheConfig();
  return Object.values(config.entries);
}

/**
 * 初始化 Bilibili 缓存模块
 */
export async function init(): Promise<void> {
  console.log("正在初始化 Bilibili 缓存模块...");

  // 确保缓存目录存在
  await getCacheDir();

  // 注册 IPC 处理器
  ipcMain.handle("cache_bilibili_video", async (event, { options }) => {
    const requestId = getNextRequestId();
    activeSenders.set(requestId, event.sender);

    // 添加 requestId 到选项中
    const optionsWithRequestId = {
      ...options,
      requestId,
    };

    try {
      const result = await cacheBilibiliVideo(optionsWithRequestId);
      activeSenders.delete(requestId);
      return { ...result, requestId };
    } catch (error) {
      activeSenders.delete(requestId);
      throw error;
    }
  });

  ipcMain.handle(
    "get_bilibili_cache_status",
    async (_, { bvid, cid, quality }) => {
      return await getBilibiliCacheStatus(bvid, cid, quality);
    },
  );

  ipcMain.handle("clear_bilibili_cache", async () => {
    return await clearBilibiliCache();
  });

  ipcMain.handle("delete_bilibili_cache", async (_, { bvid, cid, quality }) => {
    return await deleteBilibiliCache(bvid, cid, quality);
  });

  ipcMain.handle("get_bilibili_cache_size", async () => {
    return await getBilibiliCacheSize();
  });

  ipcMain.handle("list_bilibili_cache", async () => {
    return await listBilibiliCache();
  });

  console.log("Bilibili 缓存模块初始化完成");
}

export default { init };
