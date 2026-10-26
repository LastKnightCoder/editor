import type * as Y from "yjs";
import { CollaborationError } from "./protocol";

export const NODE_DOCUMENT_VERSION = 2;
export const WHITEBOARD_DOCUMENT_VERSION = 3;
export const SUPPORTED_DOCUMENT_VERSIONS = [
  NODE_DOCUMENT_VERSION,
  WHITEBOARD_DOCUMENT_VERSION,
] as const;
export type DocumentVersion = (typeof SUPPORTED_DOCUMENT_VERSIONS)[number];

export function assertCurrentDocumentVersion(version: unknown): asserts version is DocumentVersion {
  if (version !== NODE_DOCUMENT_VERSION && version !== WHITEBOARD_DOCUMENT_VERSION)
    throw new CollaborationError("UNSUPPORTED_DOCUMENT", "仅支持当前正文协议 2 和白板协议 3", 409);
}

/** 读取信封不创建 Yjs 根，也不为缺失身份生成替代值。 */
export function readDocumentIdentity(doc: Y.Doc) {
  const meta = doc.share.has("meta") ? doc.getMap("meta") : undefined;
  const version = meta?.get("version");
  assertCurrentDocumentVersion(version);
  const documentId = meta?.get("documentId"),
    baselineId = meta?.get("baselineId"),
    epoch = meta?.get("epoch");
  if (
    typeof documentId !== "string" ||
    !documentId ||
    typeof baselineId !== "string" ||
    !baselineId ||
    typeof epoch !== "number" ||
    !Number.isSafeInteger(epoch) ||
    epoch < 0
  )
    throw new CollaborationError("INVALID_DOCUMENT", "文档身份、基线或代次无效", 409);
  return { version, documentId, baselineId, epoch };
}
