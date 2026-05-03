import type { IPublishFaviconConfig } from "@/types/publish";

export const PUBLISH_FAVICON_DIR = "publish-favicon";

export const PUBLISH_FAVICON_ACCEPTED_EXTENSIONS = [
  "svg",
  "png",
  "ico",
] as const;

export type PublishFaviconExtension =
  (typeof PUBLISH_FAVICON_ACCEPTED_EXTENSIONS)[number];

export function normalizePublishFaviconExtension(
  extension: string,
): PublishFaviconExtension | null {
  const normalized = extension.trim().replace(/^\./, "").toLowerCase();
  if (
    PUBLISH_FAVICON_ACCEPTED_EXTENSIONS.includes(
      normalized as PublishFaviconExtension,
    )
  ) {
    return normalized as PublishFaviconExtension;
  }
  return null;
}

export function buildPublishFaviconCachePath(
  userDataDir: string,
  format: PublishFaviconExtension,
): string {
  return `${userDataDir}/${PUBLISH_FAVICON_DIR}/current.${format}`;
}

export function buildPublishFaviconCachePaths(userDataDir: string): string[] {
  return PUBLISH_FAVICON_ACCEPTED_EXTENSIONS.map((format) =>
    buildPublishFaviconCachePath(userDataDir, format),
  );
}

export function getParentDirFromPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const lastSlashIndex = normalized.lastIndexOf("/");
  if (lastSlashIndex < 0) {
    return "";
  }
  return normalized.slice(0, lastSlashIndex);
}

export function createPublishFaviconConfig(input: {
  cachePath: string;
  fileName: string;
  format: PublishFaviconExtension;
  updatedAt?: number;
}): IPublishFaviconConfig {
  return {
    cachePath: input.cachePath,
    fileName: input.fileName,
    format: input.format,
    updatedAt: input.updatedAt ?? Date.now(),
  };
}
