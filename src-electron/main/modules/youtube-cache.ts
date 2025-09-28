import { ipcMain, WebContents } from "electron";
import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import ytdl from "@distube/ytdl-core";
import MediaUtil from "../utils/MediaUtil";

interface YoutubeCacheEntry {
  videoId: string;
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
import PathUtil from "../utils/PathUtil";
import log from "electron-log";

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

function keyOf(videoId: string, quality?: string) {
  return crypto
    .createHash("md5")
    .update(`${videoId}-${quality || "best"}`)
    .digest("hex");
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
    async (_event, { videoId, proxy }: { videoId: string; proxy?: string }) => {
      try {
        const agent = proxy ? ytdl.createProxyAgent({ uri: proxy }) : undefined;
        const info = await ytdl.getInfo(
          `https://www.youtube.com/watch?v=${videoId}`,
          agent ? { agent } : undefined,
        );
        const fmts: ytdl.videoFormat[] = info.formats || [];

        const uniqueFmts = fmts.filter(
          (fmt, index, self) =>
            index === self.findIndex((t) => t.itag === fmt.itag),
        );

        const audioFmts = uniqueFmts
          .filter((fmt) => fmt.hasAudio && !fmt.hasVideo)
          .filter((v) => v.container === "mp4")
          .filter(
            (v, index, self) =>
              index ===
              self.findIndex((t) => t.audioQuality === v.audioQuality),
          );
        const videoFmts = uniqueFmts
          .filter((fmt) => fmt.hasVideo && !fmt.hasAudio)
          .filter((v) => v.container === "mp4")
          .filter(
            (v, index, self) =>
              index ===
              self.findIndex((t) => t.qualityLabel === v.qualityLabel),
          );

        return {
          audioFmts,
          videoFmts,
          videoId,
          title: info.videoDetails.title,
        };
      } catch (e) {
        log.warn(
          `[YouTube] get_youtube_video_info failed: ${e instanceof Error ? e.message : String(e)}`,
        );
        return null;
      }
    },
  );

  ipcMain.handle(
    "get_youtube_cache_status",
    async (_e, { videoId, quality }) => {
      const conf = await readConfig();
      const entry = conf.entries[keyOf(videoId, quality)];
      if (!entry) return null;
      try {
        await fs.access(entry.localPath);
        const stat = await fs.stat(entry.localPath);
        return { localPath: entry.localPath, fileSize: stat.size };
      } catch {
        delete conf.entries[keyOf(videoId, quality)];
        await writeConfig(conf);
        return null;
      }
    },
  );

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

  ipcMain.handle("delete_youtube_cache", async (_e, { videoId, quality }) => {
    const conf = await readConfig();
    const k = keyOf(videoId, quality);
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
    videoId: string;
    videoFormat: ytdl.videoFormat;
    audioFormat: ytdl.videoFormat;
    proxy?: string;
  },
  requestId: number,
): Promise<YoutubeCacheResult> {
  const dir = await ensureDir();
  const conf = await readConfig();

  const { videoId, videoFormat, audioFormat, proxy } = options;

  const k = keyOf(videoId, videoFormat.qualityLabel);

  if (conf.entries[k] && conf.entries[k]) {
    const entry = conf.entries[k];
    try {
      await fs.access(entry.localPath);
      const stat = await fs.stat(entry.localPath);
      return { localPath: entry.localPath, cached: true, fileSize: stat.size };
    } catch {
      delete conf.entries[k];
      await writeConfig(conf);
    }
  }

  const tempPathv = path.join(dir, `${k}.video.tmp`);
  const tempPatha = path.join(dir, `${k}.audio.tmp`);

  sendProgress({
    requestId,
    stage: "downloading",
    progress: 0,
    message: "开始下载视频...",
  });

  try {
    const agent = proxy ? ytdl.createProxyAgent({ uri: proxy }) : undefined;
    console.log("[youtube] proxy", proxy);
    const videoInfo = await ytdl.getInfo(
      `https://www.youtube.com/watch?v=${videoId}`,
      { agent },
    );

    const nodeFs = await import("fs");
    const fsStreamv = nodeFs.createWriteStream(tempPathv);
    const fsStreama = nodeFs.createWriteStream(tempPatha);

    const formatv = ytdl.chooseFormat(videoInfo.formats, {
      quality: videoFormat.itag,
    });
    const formata = ytdl.chooseFormat(videoInfo.formats, {
      quality: audioFormat.itag,
    });

    let videoDownloaded = 0;
    let audioDownloaded = 0;
    let videoTotal = 0;
    let audioTotal = 0;

    const vStream = ytdl.downloadFromInfo(videoInfo, {
      format: formatv,
      agent,
    });
    const aStream = ytdl.downloadFromInfo(videoInfo, {
      format: formata,
      agent,
    });

    const {
      resolve: vResolve,
      reject: vReject,
      promise: vPromise,
    } = Promise.withResolvers();
    const {
      resolve: aResolve,
      reject: aReject,
      promise: aPromise,
    } = Promise.withResolvers();

    vStream.on(
      "progress",
      (_chunkLength: number, downloaded: number, total: number) => {
        videoDownloaded = downloaded || 0;
        videoTotal = total || 0;
        if (videoDownloaded >= videoTotal) {
          vResolve(undefined);
        }
        sendProgress({
          requestId,
          stage: "downloading",
          progress: total > 0 ? (downloaded / total) * 100 : 0,
          message: "正在下载视频...",
          type: "video",
          videoDownloaded,
          videoTotal,
        });
      },
    );
    aStream.on(
      "progress",
      (_chunkLength: number, downloaded: number, total: number) => {
        audioDownloaded = downloaded || 0;
        audioTotal = total || 0;
        if (audioDownloaded >= audioTotal) {
          aResolve(undefined);
        }
        sendProgress({
          requestId,
          stage: "downloading",
          progress: total > 0 ? (downloaded / total) * 100 : 0,
          message: "正在下载音频...",
          type: "audio",
          audioDownloaded,
          audioTotal,
        });
      },
    );

    // 错误处理：下载流与写入流
    const onStreamError = (err: unknown) => {
      log.error(
        `[YouTube] youtubei.js 下载失败: ${err instanceof Error ? err.stack || err.message : String(err)}`,
      );
      vReject(err);
      aReject(err);
      sendProgress({
        requestId,
        stage: "error",
        progress: 0,
        message: `下载失败：${err instanceof Error ? err.stack || err.message : String(err)}`,
      });
    };

    vStream.on("error", onStreamError);
    aStream.on("error", onStreamError);
    fsStreamv.on("error", onStreamError);
    fsStreama.on("error", onStreamError);

    // 开始写入
    vStream.pipe(fsStreamv);
    aStream.pipe(fsStreama);

    await Promise.all([vPromise, aPromise]);
  } catch (err) {
    log.error(
      `[YouTube] youtubei.js 下载失败: ${err instanceof Error ? err.stack || err.message : String(err)}`,
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
        ? `网络超时，请检查代理或稍后再试`
        : `下载失败：${errMsg}`,
    });
    throw err;
  }

  console.log("stream finished, start merging");

  const output = path.join(dir, `${k}.${videoFormat.container}`);

  await MediaUtil.mergeVideoAndAudio(
    tempPathv,
    tempPatha,
    output,
    (progress) => {
      console.log("merging progress", progress);
      sendProgress({
        requestId,
        stage: "merging",
        progress,
        message: `正在合并音视频... (${progress.toFixed(1)}%)`,
      });
    },
  );

  sendProgress({
    requestId,
    stage: "completed",
    progress: 100,
    message: "合并完成",
  });

  await fs.unlink(tempPathv);
  await fs.unlink(tempPatha);

  const stat = await fs.stat(output);
  finalizeEntry(conf, k, videoId, videoFormat.qualityLabel, output, stat.size);
  return { localPath: output, cached: false, fileSize: stat.size };
}

export default { init };

async function finalizeEntry(
  conf: any,
  key: string,
  videoId: string,
  quality: string,
  localPath: string,
  fileSize: number,
) {
  conf.entries[key] = {
    videoId,
    quality,
    title: videoId,
    localPath,
    fileSize,
    createdAt: new Date().toISOString(),
    lastAccessed: new Date().toISOString(),
  };
  conf.totalSize = (conf.totalSize || 0) + fileSize;
  await writeConfig(conf);
}
