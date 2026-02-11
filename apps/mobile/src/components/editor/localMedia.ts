import { convertFileSrc as tauriConvertFileSrc } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";

const DIRECT_SOURCE_PATTERN =
  /^(https?:|data:|blob:|asset:|tauri:|file:|http:\/\/asset\.localhost)/i;

let homeDirPromise: Promise<string> | null = null;

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function isDirectMediaSource(source: string): boolean {
  return DIRECT_SOURCE_PATTERN.test(source);
}

export async function getMobileHomeDir(): Promise<string> {
  if (!homeDirPromise) {
    homeDirPromise = appDataDir();
  }
  return homeDirPromise;
}

export async function resolveLocalMediaSource(source: string): Promise<string> {
  const normalizedSource = source.trim();
  if (!normalizedSource) {
    return normalizedSource;
  }

  if (isDirectMediaSource(normalizedSource)) {
    return normalizedSource;
  }

  let localPath = normalizedSource;
  if (normalizedSource.startsWith("~")) {
    const homeDir = await getMobileHomeDir();
    localPath = `${trimTrailingSlash(homeDir)}${normalizedSource.slice(1)}`;
  }

  return tauriConvertFileSrc(localPath);
}
