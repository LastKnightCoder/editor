import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ipcMain, type WebContents } from "electron";
import ffmpeg from "fluent-ffmpeg";
import log from "electron-log";
import type { VideoPlaybackSource, VideoRef, VideoStream } from "@tau/plugins";
import PathUtil from "../utils/PathUtil";
import FfmpegService from "../utils/FfmpegService";
import YtDlpService, { normalizeDownloadErrorMessage } from "../utils/YtDlpService";
import { pluginVideoRelay } from "../services/plugin-video";
import type {
  OnlineVideoCacheProgress,
  OnlineVideoCacheResult,
} from "../../../shared/video-renderer";

const CACHE_DIR = "online-video-cache";
const INDEX_FILE = "online-video-cache.json";
/** 平台缓存退役前的目录与索引，缓存可重建，初始化时直接清除。 */
const LEGACY_CACHE = [
  "bilibili-cache",
  "bilibili-cache-config.json",
  "youtube-cache",
  "youtube-cache-config.json",
];
const PROGRESS_INTERVAL = 150;

export interface OnlineVideoTarget {
  providerId: string;
  ref: VideoRef;
  title?: string;
}

interface CacheEntry {
  providerId: string;
  title: string;
  localPath: string;
  fileSize: number;
  createdAt: string;
  lastAccessed: string;
}

type CacheIndex = Record<string, CacheEntry>;
type Progress = Omit<OnlineVideoCacheProgress, "requestId">;

const appDir = () => PathUtil.getAppDir();
const cacheDir = () => path.join(appDir(), CACHE_DIR);
const indexPath = () => path.join(appDir(), INDEX_FILE);

let indexChain: Promise<unknown> = Promise.resolve();
/** 索引读改写串行执行，避免并发缓存互相覆盖。 */
function withIndex<T>(update: (index: CacheIndex) => T | Promise<T>): Promise<T> {
  const run = indexChain.then(async () => {
    let index: CacheIndex = {};
    try {
      index = JSON.parse(await fs.readFile(indexPath(), "utf-8")) as CacheIndex;
    } catch {
      /* 索引缺失或损坏时按空缓存处理。 */
    }
    const before = JSON.stringify(index);
    const result = await update(index);
    if (JSON.stringify(index) !== before)
      await fs.writeFile(indexPath(), JSON.stringify(index, null, 2));
    return result;
  });
  indexChain = run.catch(() => undefined);
  return run;
}

async function cacheId(target: OnlineVideoTarget, signal?: AbortSignal) {
  const key = await pluginVideoRelay.call(
    { kind: "cacheKey", pluginId: target.providerId, ref: target.ref },
    signal
  );
  if (typeof key !== "string" || !key) throw new Error("插件未返回缓存身份");
  return createHash("sha256").update(`${target.providerId}\0${key}`).digest("hex");
}

async function readCached(id: string): Promise<OnlineVideoCacheResult | null> {
  return withIndex(async index => {
    const entry = index[id];
    if (!entry) return null;
    try {
      const stat = await fs.stat(entry.localPath);
      entry.lastAccessed = new Date().toISOString();
      return { localPath: entry.localPath, fileSize: stat.size, cached: true };
    } catch {
      delete index[id];
      return null;
    }
  });
}

export async function getOnlineVideoCacheStatus(target: OnlineVideoTarget, signal?: AbortSignal) {
  return readCached(await cacheId(target, signal));
}

function throttle(report: (progress: Progress) => void) {
  let last = 0;
  return (progress: Progress, force = false) => {
    const now = Date.now();
    if (!force && now - last < PROGRESS_INTERVAL) return;
    last = now;
    report(progress);
  };
}

async function download(
  stream: VideoStream,
  file: string,
  signal: AbortSignal,
  onBytes: (done: number, total: number) => void
) {
  const response = await fetch(stream.url, { headers: stream.headers, signal });
  if (!response.ok || !response.body) throw new Error(`视频下载失败：HTTP ${response.status}`);
  const total = Number(response.headers.get("content-length")) || 0;
  let done = 0;
  const source = Readable.fromWeb(response.body as import("node:stream/web").ReadableStream);
  source.on("data", (chunk: Buffer) => {
    done += chunk.length;
    onBytes(done, total);
  });
  await pipeline(source, createWriteStream(file), { signal });
}

async function merge(
  video: string,
  audio: string,
  output: string,
  signal: AbortSignal,
  onPercent: (percent: number) => void
) {
  await FfmpegService.ensureFluentFfmpegPath();
  await new Promise<void>((resolve, reject) => {
    const command = ffmpeg(video)
      .input(audio)
      .outputOptions(["-c:v copy", "-c:a copy", "-shortest"])
      .on("progress", progress => onPercent(progress.percent || 0))
      .on("end", () => resolve())
      .on("error", error =>
        reject(
          signal.aborted
            ? new DOMException("视频下载已取消", "AbortError")
            : new Error(`合并音视频失败：${error.message}`)
        )
      );
    signal.addEventListener("abort", () => command.kill("SIGKILL"), { once: true });
    command.save(output);
  });
}

async function fetchSource(
  source: VideoPlaybackSource,
  id: string,
  signal: AbortSignal,
  report: ReturnType<typeof throttle>
): Promise<string> {
  const dir = cacheDir();
  await fs.mkdir(dir, { recursive: true });
  const output = path.join(dir, `${id}.mp4`);
  const temporary = [`${id}.video.tmp`, `${id}.audio.tmp`, `${id}.tmp.mp4`].map(name =>
    path.join(dir, name)
  );
  try {
    if (source.kind === "file") {
      await download(source.stream, temporary[2], signal, (downloaded, total) =>
        report({
          stage: "downloading",
          downloaded,
          total,
          percent: total ? (downloaded / total) * 100 : undefined,
        })
      );
      await fs.rename(temporary[2], output);
    } else if (source.kind === "split") {
      const progress: Progress = { stage: "downloading", message: "正在下载视频与音频…" };
      await Promise.all(
        (["video", "audio"] as const).map((track, position) =>
          download(source[track], temporary[position], signal, (downloaded, total) => {
            progress[`${track}Downloaded`] = downloaded;
            progress[`${track}Total`] = total;
            report({ ...progress });
          })
        )
      );
      report({ stage: "merging", percent: 0, message: "正在合并音视频…" }, true);
      await merge(temporary[0], temporary[1], temporary[2], signal, percent =>
        report({ stage: "merging", percent, message: "正在合并音视频…" })
      );
      await fs.rename(temporary[2], output);
    } else {
      const result = await YtDlpService.downloadVideo({
        url: source.url,
        videoFormatId: source.videoFormat ?? "",
        audioFormatId: source.audioFormat ?? "",
        outputDir: dir,
        basename: id,
        targetExt: "mp4",
        proxy: source.proxy,
        signal,
        onProgress: progress =>
          report(
            progress.stage === "merging"
              ? { stage: "merging", percent: progress.percent, message: progress.message }
              : {
                  stage: "downloading",
                  message: progress.message,
                  percent: progress.percent,
                  ...(progress.type
                    ? {
                        [`${progress.type}Downloaded`]: progress.downloadedBytes,
                        [`${progress.type}Total`]: progress.totalBytes,
                      }
                    : { downloaded: progress.downloadedBytes, total: progress.totalBytes }),
                }
          ),
      }).catch(error => {
        if (signal.aborted) throw error;
        const raw = error instanceof Error ? error.message : String(error);
        log.error(`[OnlineVideoCache] yt-dlp 下载失败：${raw}`);
        throw new Error(normalizeDownloadErrorMessage(raw));
      });
      if (result.outputPath !== output) await fs.rename(result.outputPath, output);
    }
    return output;
  } catch (error) {
    await fs.rm(output, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    await Promise.all(temporary.map(file => fs.rm(file, { force: true }).catch(() => undefined)));
  }
}

interface Flight {
  promise: Promise<OnlineVideoCacheResult>;
  listeners: Set<(progress: Progress) => void>;
  controller: AbortController;
  waiters: number;
}
const flights = new Map<string, Flight>();

/** 确保视频已缓存到本地：命中缓存不调用插件取流，同一视频并发请求共用一次下载。 */
export async function ensureOnlineVideo(
  target: OnlineVideoTarget,
  options: { signal?: AbortSignal; onProgress?: (progress: Progress) => void } = {}
): Promise<OnlineVideoCacheResult> {
  const id = await cacheId(target, options.signal);
  const cached = await readCached(id);
  if (cached) return cached;
  let flight = flights.get(id);
  if (!flight) {
    const controller = new AbortController();
    const listeners = new Set<(progress: Progress) => void>();
    const report = throttle(progress => listeners.forEach(listener => listener(progress)));
    const promise = (async () => {
      const source = await pluginVideoRelay.call(
        { kind: "playback", pluginId: target.providerId, ref: target.ref },
        controller.signal
      );
      const localPath = await fetchSource(source, id, controller.signal, report);
      const { size } = await fs.stat(localPath);
      const now = new Date().toISOString();
      await withIndex(index => {
        index[id] = {
          providerId: target.providerId,
          title: target.title ?? "",
          localPath,
          fileSize: size,
          createdAt: now,
          lastAccessed: now,
        };
      });
      report({ stage: "completed", message: "视频已就绪" }, true);
      return { localPath, fileSize: size, cached: false };
    })().finally(() => flights.delete(id));
    // 全部等待方都已离开时下载被中止，失败不再有人接收。
    promise.catch(() => undefined);
    flight = { promise, listeners, controller, waiters: 0 };
    flights.set(id, flight);
  }
  const current = flight;
  const listener = options.onProgress;
  if (listener) current.listeners.add(listener);
  current.waiters += 1;
  const signal = options.signal;
  try {
    if (!signal) return await current.promise;
    signal.throwIfAborted();
    return await Promise.race([
      current.promise,
      new Promise<never>((_resolve, reject) =>
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("视频下载已取消", "AbortError")),
          { once: true }
        )
      ),
    ]);
  } finally {
    if (listener) current.listeners.delete(listener);
    current.waiters -= 1;
    // 所有等待方都取消后才中止下载，其他窗口仍在等待时继续。
    if (signal?.aborted && current.waiters === 0) current.controller.abort();
  }
}

export interface OnlineVideoCacheEntry extends CacheEntry {
  id: string;
}

const listCache = () =>
  withIndex(index =>
    Object.entries(index).map(([id, entry]): OnlineVideoCacheEntry => ({ id, ...entry }))
  );

const deleteCache = (id: string) =>
  withIndex(async index => {
    const entry = index[id];
    if (!entry) return false;
    await fs.rm(entry.localPath, { force: true });
    delete index[id];
    return true;
  });

async function clearCache() {
  await withIndex(async index => {
    for (const [id, entry] of Object.entries(index)) {
      await fs.rm(entry.localPath, { force: true }).catch(() => undefined);
      delete index[id];
    }
  });
}

const requests = new Map<string, { owner: number; controller: AbortController }>();

function send(sender: WebContents, progress: OnlineVideoCacheProgress) {
  if (!sender.isDestroyed()) sender.send("online-video-cache:progress", progress);
}

export async function init() {
  await Promise.all(
    LEGACY_CACHE.map(name =>
      fs.rm(path.join(appDir(), name), { recursive: true, force: true }).catch(error => {
        log.warn(`[OnlineVideoCache] 清除旧缓存失败：${name}`, error);
      })
    )
  );
  ipcMain.handle(
    "online-video-cache:ensure",
    async (event, requestId: string, target: OnlineVideoTarget) => {
      if (requests.has(requestId)) throw new Error("视频缓存请求已存在");
      const controller = new AbortController();
      requests.set(requestId, { owner: event.sender.id, controller });
      const release = () => controller.abort();
      event.sender.once("destroyed", release);
      try {
        return await ensureOnlineVideo(target, {
          signal: controller.signal,
          onProgress: progress => send(event.sender, { ...progress, requestId }),
        });
      } finally {
        requests.delete(requestId);
        event.sender.off("destroyed", release);
      }
    }
  );
  ipcMain.handle("online-video-cache:cancel", (event, requestId: string) => {
    const request = requests.get(requestId);
    if (request?.owner === event.sender.id) request.controller.abort();
  });
  ipcMain.handle("online-video-cache:status", (_event, target: OnlineVideoTarget) =>
    getOnlineVideoCacheStatus(target)
  );
  ipcMain.handle("online-video-cache:list", () => listCache());
  ipcMain.handle("online-video-cache:delete", (_event, id: string) => deleteCache(id));
  ipcMain.handle("online-video-cache:clear", () => clearCache());
  ipcMain.handle("video-extractor:probe", (_event, url: string, proxy?: string) =>
    YtDlpService.probe(url, proxy)
  );
}

export default { init };
