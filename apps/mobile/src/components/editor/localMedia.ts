import { convertFileSrc as tauriConvertFileSrc } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";
import * as tauri from "../../services/tauri";

const KNOWN_DIRECT_SOURCE_PATTERN =
  /^(data:|blob:|asset:|tauri:|file:|http:\/\/asset\.localhost)/i;

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

export async function resolveLocalMediaSource(source: string): Promise<string> {
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
      const localizedUrl = await tauriConvertFileSrc(localPath);
      console.info("[mobile-local-media] localized remote resource", {
        source: normalizedSource,
        localPath,
        localizedUrl,
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

  return tauriConvertFileSrc(localPath);
}
