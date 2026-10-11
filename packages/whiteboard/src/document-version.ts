/** 当前应用可读写的白板文档版本；保存时永远写入该值。 */
export const WHITEBOARD_DOCUMENT_VERSION = 2;

/**
 * 从持久化的白板页 data（JSON 解析结果）取文档版本。
 * 旧数据没有 version 字段或值非法（非正整数）时视为 1。
 */
export function getDocumentVersion(data: unknown): number {
  if (!data || typeof data !== "object") return 1;
  const version = (data as { version?: unknown }).version;
  return typeof version === "number" && Number.isInteger(version) && version > 0 ? version : 1;
}

/** 版本高于当前应用支持的范围时只读展示，不写回。 */
export function isDocumentVersionSupported(version: number): boolean {
  return version <= WHITEBOARD_DOCUMENT_VERSION;
}
