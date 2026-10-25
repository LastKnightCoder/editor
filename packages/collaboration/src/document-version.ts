import type * as Y from "yjs";
import { COLLABORATION_VERSION, CollaborationError } from "./protocol";

export function assertLegacyDocument(doc: Y.Doc): void {
  const version = doc.share.has("meta") ? doc.getMap("meta").get("version") : undefined;
  if (version !== undefined && version !== COLLABORATION_VERSION)
    throw new CollaborationError(
      "UNSUPPORTED_DOCUMENT",
      "当前内容入口不支持该文档协议，请升级客户端",
      409
    );
}
