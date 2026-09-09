/**
 * 模型仓库下载工具
 *
 * 替代原 Python 侧 modelscope / huggingface_hub 的 snapshot_download：
 * - 列出仓库文件（ModelScope files API / HF tree API）
 * - 流式下载（跟随重定向、进度、取消、失败清理）
 */

import http from "http";
import https from "https";
import fs from "fs-extra";
import path from "path";

export type DownloadSource = "modelscope" | "huggingface";

export interface RepoFile {
  path: string;
  size?: number;
}

export interface DownloadProgressInfo {
  percentage: number;
  message: string;
  downloadedBytes: number;
  totalBytes?: number;
  source: DownloadSource;
}

export interface DownloadRepoOptions {
  source: DownloadSource;
  repoId: string;
  /** 仅下载这些文件（含子路径）；缺省为整个仓库 */
  files?: RepoFile[];
  targetDir: string;
  /** 相对 targetDir 的根目录（文件将保存到 targetDir/<rootDir>/<path>） */
  rootDir?: string;
  onProgress?: (progress: DownloadProgressInfo) => void;
  signal?: AbortSignal;
}

export class DownloadCancelledError extends Error {
  constructor() {
    super("Download cancelled");
    this.name = "DownloadCancelledError";
  }
}

const MAX_REDIRECTS = 6;

// ModelScope/HF 的 CDN 会拒绝无 User-Agent 的请求（403），必须带 UA
const DOWNLOAD_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

function requestOnce(
  url: string,
  callback: (response: http.IncomingMessage) => void,
  signal?: AbortSignal
): http.ClientRequest {
  const urlObject = new URL(url);
  const requestImpl = urlObject.protocol === "https:" ? https : http;
  const request = requestImpl.get(
    url,
    { headers: { "User-Agent": DOWNLOAD_UA, Accept: "*/*" } },
    callback
  );
  if (signal) {
    const onAbort = () => {
      request.destroy(new DownloadCancelledError());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    request.on("close", () => signal.removeEventListener("abort", onAbort));
  }
  return request;
}

function requestJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let currentUrl = url;
    let redirects = 0;

    const attempt = () => {
      const request = requestOnce(
        currentUrl,
        response => {
          const statusCode = response.statusCode || 0;
          if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
            response.resume();
            if (redirects >= MAX_REDIRECTS) {
              reject(new Error(`请求重定向次数过多: ${url}`));
              return;
            }
            redirects += 1;
            currentUrl = new URL(response.headers.location, currentUrl).toString();
            attempt();
            return;
          }
          if (statusCode >= 400) {
            response.resume();
            reject(new Error(`请求失败(${statusCode}): ${currentUrl}`));
            return;
          }
          const chunks: Buffer[] = [];
          response.on("data", (chunk: Buffer) => chunks.push(chunk));
          response.on("error", reject);
          response.on("end", () => {
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")) as T);
            } catch (error) {
              reject(error instanceof Error ? error : new Error(String(error)));
            }
          });
        },
        signal
      );
      request.on("error", reject);
    };

    attempt();
  });
}

/** 兼容 requestOnce 返回 ClientRequest 以挂 error 处理 */
function streamToFile(
  url: string,
  destPath: string,
  options: {
    onBytes?: (downloaded: number, total: number) => void;
    signal?: AbortSignal;
  } = {}
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let currentUrl = url;
    let redirects = 0;

    const attempt = () => {
      const request = requestOnce(
        currentUrl,
        response => {
          const statusCode = response.statusCode || 0;
          if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
            response.resume();
            if (redirects >= MAX_REDIRECTS) {
              reject(new Error(`下载重定向次数过多: ${url}`));
              return;
            }
            redirects += 1;
            currentUrl = new URL(response.headers.location, currentUrl).toString();
            attempt();
            return;
          }
          if (statusCode >= 400) {
            response.resume();
            reject(new Error(`下载失败(${statusCode}): ${currentUrl}`));
            return;
          }

          const total = Number(response.headers["content-length"] || 0);
          let downloaded = 0;
          const tempPath = `${destPath}.tmp`;

          const fail = (error: Error) => {
            response.destroy();
            void fs
              .remove(tempPath)
              .catch(() => undefined)
              .finally(() => reject(error));
          };

          const writeStream = fs.createWriteStream(tempPath);
          response.on("data", (chunk: Buffer) => {
            downloaded += chunk.length;
            options.onBytes?.(downloaded, total);
          });
          response.on("error", fail);
          writeStream.on("error", fail);
          writeStream.on("close", () => {
            void fs
              .move(tempPath, destPath, { overwrite: true })
              .then(() => resolve())
              .catch(fail);
          });
          response.pipe(writeStream);
        },
        options.signal
      );
      request.on("error", reject);
    };

    attempt();
  });
}

interface ModelScopeFilesResponse {
  Code: number;
  Data?: {
    Files?: Array<{
      Path: string;
      Name?: string;
      Size?: number;
      Type?: string;
    }>;
  };
}

async function listModelScopeFiles(
  repoId: string,
  root: string,
  signal?: AbortSignal
): Promise<RepoFile[]> {
  const url = `https://modelscope.cn/api/v1/models/${repoId}/repo/files?Revision=master&Root=${encodeURIComponent(root)}`;
  const payload = await requestJson<ModelScopeFilesResponse>(url, signal);
  const files: RepoFile[] = [];
  for (const file of payload.Data?.Files || []) {
    if (!file.Path) {
      continue;
    }
    if (file.Type === "tree") {
      const nested = await listModelScopeFiles(repoId, file.Path, signal);
      files.push(...nested);
    } else {
      files.push({ path: file.Path, size: file.Size });
    }
  }
  return files;
}

interface HuggingFaceTreeEntry {
  path: string;
  type: string;
  size?: number;
}

async function listHuggingFaceFiles(repoId: string, signal?: AbortSignal): Promise<RepoFile[]> {
  const url = `https://huggingface.co/api/models/${repoId}/tree/main?recursive=true`;
  const payload = await requestJson<HuggingFaceTreeEntry[]>(url, signal);
  return payload
    .filter(entry => entry.type === "file")
    .map(entry => ({ path: entry.path, size: entry.size }));
}

export async function listRepoFiles(
  source: DownloadSource,
  repoId: string,
  signal?: AbortSignal
): Promise<RepoFile[]> {
  if (source === "modelscope") {
    return listModelScopeFiles(repoId, "", signal);
  }
  return listHuggingFaceFiles(repoId, signal);
}

export function buildRawFileUrl(source: DownloadSource, repoId: string, filePath: string): string {
  if (source === "modelscope") {
    return `https://modelscope.cn/api/v1/models/${repoId}/repo?Revision=master&FilePath=${encodeURIComponent(filePath)}`;
  }
  return `https://huggingface.co/${repoId}/resolve/main/${filePath
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

const SKIP_FILES = new Set([".gitattributes"]);

function formatBytes(size: number): string {
  if (size >= 1024 * 1024 * 1024) {
    return `${(size / 1024 / 1024 / 1024).toFixed(2)}GB`;
  }
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)}MB`;
  }
  if (size >= 1024) {
    return `${(size / 1024).toFixed(0)}KB`;
  }
  return `${size}B`;
}

/**
 * 下载仓库文件集合到目标目录。
 * 返回最终保存目录（targetDir/rootDir）。
 */
export async function downloadRepoFiles(options: DownloadRepoOptions): Promise<string> {
  const { source, repoId, targetDir, rootDir, signal } = options;

  if (signal?.aborted) {
    throw new DownloadCancelledError();
  }

  let files = options.files;
  if (!files) {
    files = (await listRepoFiles(source, repoId, signal)).filter(
      file => !SKIP_FILES.has(file.path)
    );
  }

  if (!files.length) {
    throw new Error(`仓库 ${repoId} 中没有可下载的文件`);
  }

  const saveRoot = rootDir ? path.join(targetDir, rootDir) : targetDir;
  await fs.ensureDir(saveRoot);

  const totalBytes = files.reduce((sum, file) => sum + (file.size || 0), 0);
  let downloadedBytes = 0;
  let lastPercentage = -1;

  const emitProgress = (force = false) => {
    if (!options.onProgress) {
      return;
    }
    let percentage = 0;
    if (totalBytes > 0) {
      percentage = Math.max(0, Math.min(99, Math.floor((downloadedBytes / totalBytes) * 100)));
    }
    if (!force && percentage === lastPercentage) {
      return;
    }
    lastPercentage = percentage;
    const message =
      totalBytes > 0
        ? `正在下载模型... ${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`
        : `正在下载模型... 已下载 ${formatBytes(downloadedBytes)}`;
    options.onProgress({
      percentage,
      message,
      downloadedBytes,
      totalBytes: totalBytes > 0 ? totalBytes : undefined,
      source,
    });
  };

  emitProgress(true);

  for (const file of files) {
    if (signal?.aborted) {
      throw new DownloadCancelledError();
    }

    const destPath = path.join(saveRoot, file.path);
    await fs.ensureDir(path.dirname(destPath));

    let fileDownloaded = 0;
    await streamToFile(buildRawFileUrl(source, repoId, file.path), destPath, {
      signal,
      onBytes: downloaded => {
        const delta = downloaded - fileDownloaded;
        fileDownloaded = downloaded;
        downloadedBytes += Math.max(0, delta);
        emitProgress();
      },
    });
  }

  options.onProgress?.({
    percentage: 100,
    message: "下载完成",
    downloadedBytes: totalBytes > 0 ? totalBytes : downloadedBytes,
    totalBytes: totalBytes > 0 ? totalBytes : undefined,
    source,
  });

  return saveRoot;
}
