import { convertFileSrc as tauriConvertFileSrc } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";
import * as tauri from "../../services/tauri";
import { base64ToUint8Array } from "../../utils/base64";
import { logPerf } from "../../utils/perf";

const KNOWN_DIRECT_SOURCE_PATTERN = /^(data:|blob:|asset:|tauri:|file:|http:\/\/asset\.localhost)/i;

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function isProtocolRelativeUrl(value: string): boolean {
  return value.startsWith("//");
}

function isWindowsAbsolutePath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || /^\\\\/.test(value);
}

function hasCustomScheme(value: string): boolean {
  if (isWindowsAbsolutePath(value)) {
    return false;
  }
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value);
}

let homeDirPromise: Promise<string> | null = null;

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

/* ── blob URL 渲染通道 ──
   Android 的 asset protocol 无法在 WebView 加载图片（tauri#12364 官方未决），
   媒体统一改走 Rust 读文件 + 二进制 IPC + blob URL；asset protocol 仅作回退 */
const objectUrlCache = new Map<string, string>();

// 媒体读取并发上限：首屏多张封面同时打 base64 IPC 会把主线程压出密集 longtask，
// 限流让帧率优先、图片渐次到位（实测无限流时打开文章列表 avg 帧间隔 >50ms）
const MAX_CONCURRENT_MEDIA_READS = 3;
let activeMediaReads = 0;
const mediaReadQueue: Array<() => void> = [];

function scheduleMediaRead<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      activeMediaReads += 1;
      task()
        .then(resolve, reject)
        .finally(() => {
          activeMediaReads -= 1;
          mediaReadQueue.shift()?.();
        });
    };
    if (activeMediaReads < MAX_CONCURRENT_MEDIA_READS) {
      run();
    } else {
      mediaReadQueue.push(run);
    }
  });
}

const EXT_MIME_TYPES: Record<string, string> = {
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
};

function mimeFromPath(path: string): string | undefined {
  const ext = path.split(".").pop()?.toLowerCase();
  return ext ? EXT_MIME_TYPES[ext] : undefined;
}

async function readMediaObjectUrl(
  localPath: string,
  options: { thumbnail?: boolean } = {}
): Promise<string | null> {
  const cacheKey = options.thumbnail ? `thumb:${localPath}` : localPath;
  const cached = objectUrlCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  try {
    // 命令返回 base64 字符串（Android 二进制 IPC 不可靠，见 tauri#10573）
    const startedAt = performance.now();
    const base64 = await scheduleMediaRead(() =>
      options.thumbnail ? tauri.readResourceThumb(localPath) : tauri.readResourceBytes(localPath)
    );
    const blob = new Blob([base64ToUint8Array(base64)], {
      type: options.thumbnail ? "image/webp" : mimeFromPath(localPath),
    });
    const objectUrl = URL.createObjectURL(blob);
    objectUrlCache.set(cacheKey, objectUrl);
    // 诊断卡顿：封面读取曾是打开列表的主瓶颈，保留耗时与体积打点
    const fileName = localPath.split(/[\\/]/).pop() ?? localPath;
    logPerf(
      "media",
      `read${options.thumbnail ? " thumb" : ""} ${fileName} ${(base64.length / 1024).toFixed(0)}KB`,
      performance.now() - startedAt
    );
    return objectUrl;
  } catch (error) {
    console.error("[mobile-local-media] read resource bytes failed", { localPath, error });
    return null;
  }
}

export function isDirectMediaSource(source: string): boolean {
  const normalizedSource = source.trim();
  if (!normalizedSource) {
    return false;
  }
  return (
    isHttpUrl(normalizedSource) ||
    KNOWN_DIRECT_SOURCE_PATTERN.test(normalizedSource) ||
    isProtocolRelativeUrl(normalizedSource) ||
    hasCustomScheme(normalizedSource)
  );
}

export async function getMobileHomeDir(): Promise<string> {
  if (!homeDirPromise) {
    homeDirPromise = appDataDir();
  }
  return homeDirPromise;
}

export async function resolveLocalMediaSource(
  source: string,
  options: { thumbnail?: boolean } = {}
): Promise<string> {
  const normalizedSource = source.trim();
  if (!normalizedSource) {
    return normalizedSource;
  }

  if (KNOWN_DIRECT_SOURCE_PATTERN.test(normalizedSource)) {
    return normalizedSource;
  }

  if (isHttpUrl(normalizedSource)) {
    const startedAt = Date.now();
    try {
      const localPath = await tauri.remoteResourceToLocal(normalizedSource);
      const objectUrl = await readMediaObjectUrl(localPath, options);
      if (objectUrl) {
        console.info("[mobile-local-media] localized remote resource", {
          source: normalizedSource,
          localPath,
          via: "blob",
          elapsedMs: Date.now() - startedAt,
        });
        return objectUrl;
      }
      const localizedUrl = await tauriConvertFileSrc(localPath);
      console.info("[mobile-local-media] localized remote resource", {
        source: normalizedSource,
        localPath,
        localizedUrl,
        via: "asset-protocol",
        elapsedMs: Date.now() - startedAt,
      });
      return localizedUrl;
    } catch (error) {
      console.error("[mobile-local-media] localize remote resource failed", {
        source: normalizedSource,
        elapsedMs: Date.now() - startedAt,
        error,
      });
      return normalizedSource;
    }
  }

  if (isProtocolRelativeUrl(normalizedSource)) {
    return normalizedSource;
  }

  if (hasCustomScheme(normalizedSource)) {
    return normalizedSource;
  }

  let localPath = normalizedSource;
  if (normalizedSource.startsWith("~")) {
    const homeDir = await getMobileHomeDir();
    localPath = `${trimTrailingSlash(homeDir)}${normalizedSource.slice(1)}`;
  }

  const objectUrl = await readMediaObjectUrl(localPath, options);
  if (objectUrl) {
    return objectUrl;
  }
  return tauriConvertFileSrc(localPath);
}
