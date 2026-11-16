import { extname } from "node:path";

export const MAX_RESOURCE_READ_CHARS = 100 * 1024;

export function formatTimestamp(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function isRemoteUrl(path: string): boolean {
  return path.startsWith("http://") || path.startsWith("https://");
}

/**
 * 检查是否为音频文件
 */
export function isAudioFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  const audioExtensions = [".mp3", ".wav", ".flac", ".aac", ".ogg", ".wma", ".m4a", ".opus"];
  return audioExtensions.includes(ext);
}

/**
 * 检查是否为媒体文件（音频或视频）
 */
export function isMediaFile(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  const mediaExtensions = [
    // 视频
    ".mp4",
    ".mkv",
    ".avi",
    ".mov",
    ".wmv",
    ".flv",
    ".webm",
    ".m4v",
    ".ts",
    // 音频
    ".mp3",
    ".wav",
    ".flac",
    ".aac",
    ".ogg",
    ".wma",
    ".m4a",
    ".opus",
  ];
  return mediaExtensions.includes(ext);
}

export function getExtFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const ext = extname(pathname);
    return ext || "";
  } catch {
    return "";
  }
}

export function clampRange(
  start: number,
  end: number,
  max: number
): { start: number; end: number; truncated: boolean } {
  const validStart = Math.max(0, Math.min(Math.floor(start), max));
  const requestedEnd = Math.max(validStart, Math.min(Math.floor(end), max));
  const limitedEnd = Math.min(requestedEnd, validStart + MAX_RESOURCE_READ_CHARS);
  return {
    start: validStart,
    end: limitedEnd,
    truncated: limitedEnd < requestedEnd,
  };
}
