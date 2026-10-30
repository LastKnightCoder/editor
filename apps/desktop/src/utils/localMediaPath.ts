import {
  convertFileSrc,
  getDirectoryName,
  getEditorDir,
  getFileExtension,
  getHomeDir,
  readBinaryFile,
} from "@/commands/file";
import { resolvePath } from "@/commands/extra";
import { normalizeLocalResourcePath } from "@tau/shared/resource-path";

const DIRECT_PREFIXES = ["data:", "blob:", "http://localhost", "ltoh://"];

const fileDirCache = new Map<string, string>();

const tryDecodeURIComponent = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value);

const isWindowsAbsolutePath = (value: string) =>
  /^[a-zA-Z]:[\\/]/.test(value) || /^\\\\/.test(value);

const isAbsoluteFilePath = (value: string) => value.startsWith("/") || isWindowsAbsolutePath(value);

const normalizeSlash = (value: string) => value.replace(/\\/g, "/");

const isSubPath = (value: string, basePath: string) => {
  const normalizedValue = normalizeSlash(value);
  const normalizedBase = normalizeSlash(basePath).replace(/\/+$/, "");
  if (!normalizedBase) {
    return false;
  }
  return normalizedValue === normalizedBase || normalizedValue.startsWith(`${normalizedBase}/`);
};

export const getMediaMimeType = (ext: string): string => {
  const mimeTypes: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".svg": "image/svg+xml",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".flac": "audio/flac",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".mkv": "video/x-matroska",
  };
  return mimeTypes[ext.toLowerCase()] || "application/octet-stream";
};

export type LocalMediaPreviewMethod = "app-protocol" | "blob";

export const toLocalMediaPreviewUrl = async (
  absolutePath: string
): Promise<{ url: string; method: LocalMediaPreviewMethod }> => {
  const editorDir = await getEditorDir();
  if (isSubPath(absolutePath, editorDir)) {
    const url = await convertFileSrc(absolutePath);
    return { url, method: "app-protocol" };
  }

  const data = (await readBinaryFile(absolutePath)) as Uint8Array<ArrayBuffer>;
  const ext = await getFileExtension(absolutePath);
  const blob = new Blob([data], { type: getMediaMimeType(ext) });
  return { url: URL.createObjectURL(blob), method: "blob" };
};

export const isDirectMediaUrl = (value: string) => {
  if (!value) {
    return false;
  }
  return DIRECT_PREFIXES.some(prefix => value.startsWith(prefix));
};

const getSearchParamsFromLocation = () => {
  if (typeof window === "undefined") {
    return new URLSearchParams();
  }

  if (window.location.search) {
    return new URLSearchParams(window.location.search);
  }

  const hash = window.location.hash || "";
  const queryIndex = hash.indexOf("?");
  if (queryIndex >= 0) {
    const queryString = hash.slice(queryIndex + 1);
    return new URLSearchParams(queryString);
  }

  return new URLSearchParams();
};

const getCurrentFilePathFromSearch = () => {
  if (typeof window === "undefined") {
    return "";
  }

  const params = getSearchParamsFromLocation();
  const encodedFilePath = params.get("filePath") || "";
  return tryDecodeURIComponent(encodedFilePath);
};

const parseFileUrlToPath = (value: string) => {
  try {
    const url = new URL(value);
    if (url.protocol !== "file:") {
      return "";
    }

    let filePath = tryDecodeURIComponent(url.pathname || "");
    if (url.hostname) {
      filePath = `//${url.hostname}${filePath}`;
    }

    if (/^\/[a-zA-Z]:\//.test(filePath)) {
      filePath = filePath.slice(1);
    }

    return filePath;
  } catch {
    return "";
  }
};

const expandHomeDir = async (value: string) => {
  if (!value.startsWith("~")) {
    return value;
  }
  const homeDir = normalizeSlash(await getHomeDir()).replace(/\/+$/, "");
  return `${homeDir}${value.slice(1)}`;
};

const normalizeAbsolutePath = async (value: string) => {
  try {
    return await resolvePath(value);
  } catch {
    return value;
  }
};

const resolveRelativePath = async (value: string) => {
  const currentFilePath = getCurrentFilePathFromSearch();
  if (!currentFilePath) {
    return value;
  }

  let currentDir = fileDirCache.get(currentFilePath);
  if (!currentDir) {
    try {
      currentDir = await getDirectoryName(currentFilePath);
      fileDirCache.set(currentFilePath, currentDir);
    } catch {
      return value;
    }
  }

  const baseDir = currentDir.replace(/[\\/]+$/, "");
  const joinedPath = `${baseDir}/${value}`;
  return normalizeAbsolutePath(joinedPath);
};

export const resolveLocalMediaPath = async (rawValue: string) => {
  const trimmedValue = (rawValue || "").trim();
  if (!trimmedValue) {
    return "";
  }

  if (isDirectMediaUrl(trimmedValue) || isHttpUrl(trimmedValue)) {
    return trimmedValue;
  }

  const fileUrlPath = parseFileUrlToPath(trimmedValue);
  const value = normalizeLocalResourcePath(fileUrlPath || trimmedValue);

  const homeExpandedPath = await expandHomeDir(value);

  if (isAbsoluteFilePath(homeExpandedPath)) {
    return normalizeAbsolutePath(homeExpandedPath);
  }

  return resolveRelativePath(homeExpandedPath);
};
