export const INLINE_CONTENT_STORAGE_VERSION = 2;
export const BLOCK_CONTENT_STORAGE_VERSION = 3;

export function isSupportedContentStorageVersion(version: unknown): boolean {
  return version === INLINE_CONTENT_STORAGE_VERSION || version === BLOCK_CONTENT_STORAGE_VERSION;
}
