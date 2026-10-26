import * as Y from "yjs";
import {
  validateNodeDocument,
  readNodeDocument,
  collectNodeDocumentResources,
  NODE_DOCUMENT_VERSION,
  type NodeDocumentIdentity,
} from "./node-document";
import {
  validateWhiteboardDocument,
  collectWhiteboardDocumentResources,
  WHITEBOARD_DOCUMENT_VERSION,
} from "./whiteboard-document";
import { WhiteboardModel } from "./whiteboard-model";
import { readDocumentIdentity } from "./document-version";
import { CollaborationError } from "./protocol";

export const isStructuredDocumentVersion = (version: unknown): boolean =>
  version === NODE_DOCUMENT_VERSION || version === WHITEBOARD_DOCUMENT_VERSION;
export function validateStructuredDocument(
  doc: Y.Doc,
  identity?: NodeDocumentIdentity,
  previous?: Y.Doc
): Promise<void> {
  const version = readDocumentIdentity(doc).version;
  if (previous && readDocumentIdentity(previous).version !== version)
    throw new CollaborationError("BASELINE_CONFLICT", "普通更新不能改变文档种类", 409);
  if (version === NODE_DOCUMENT_VERSION) return validateNodeDocument(doc, identity, previous);
  if (version === WHITEBOARD_DOCUMENT_VERSION)
    return validateWhiteboardDocument(doc, identity, previous);
  throw new CollaborationError("UNSUPPORTED_DOCUMENT", "未知文档协议", 409);
}
export function readDocumentProjection(doc: Y.Doc) {
  readDocumentIdentity(doc);
  if (doc.getMap("meta").get("version") === WHITEBOARD_DOCUMENT_VERSION) {
    const model = new WhiteboardModel(doc);
    try {
      return model.read();
    } finally {
      model.dispose();
    }
  }
  if (doc.getMap("meta").get("version") === NODE_DOCUMENT_VERSION) return readNodeDocument(doc);
  throw new CollaborationError("UNSUPPORTED_DOCUMENT", "不支持的文档协议", 409);
}
export function collectDocumentResources(doc: Y.Doc): unknown {
  readDocumentIdentity(doc);
  if (doc.getMap("meta").get("version") === WHITEBOARD_DOCUMENT_VERSION)
    return collectWhiteboardDocumentResources(doc);
  if (doc.getMap("meta").get("version") === NODE_DOCUMENT_VERSION)
    return collectNodeDocumentResources(doc);
  throw new CollaborationError("UNSUPPORTED_DOCUMENT", "不支持的文档协议", 409);
}
export async function applyStructuredDocumentUpdate(
  current: Y.Doc,
  update: Uint8Array,
  identity: NodeDocumentIdentity
): Promise<Y.Doc> {
  if (!update.byteLength || update.byteLength > 8 * 1024 * 1024)
    throw new CollaborationError("INVALID_UPDATE", "更新容量无效", 400);
  const candidate = new Y.Doc({ gc: false });
  try {
    Y.applyUpdate(candidate, Y.encodeStateAsUpdate(current));
    Y.applyUpdate(candidate, update);
    await validateStructuredDocument(candidate, identity, current);
    return candidate;
  } catch (error) {
    candidate.destroy();
    if (error instanceof CollaborationError) throw error;
    throw new CollaborationError("INVALID_UPDATE", "更新损坏或不兼容", 400);
  }
}
