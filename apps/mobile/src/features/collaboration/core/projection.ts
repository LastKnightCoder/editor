import { readNodeDocument, NODE_DOCUMENT_VERSION } from "@tau/collaboration";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import * as tauri from "../../../services/tauri";
import { localizeDocumentResources } from "./resources";
import type { CollaborationManager } from "./manager";

export async function project(
  manager: CollaborationManager,
  documentId: string,
  plugin?: {
    token: string;
    database: string;
    pluginId: string;
    taskOperationId?: number;
    taskRestoreId?: number;
    timeZone?: string;
  },
  guard?: () => Promise<void>,
  background = false,
  closing = false
): Promise<void> {
  const session = manager.sessions.get(documentId);
  if (
    !session?.info.source ||
    (session.info.leaving && !closing) ||
    session.info.frozen ||
    session.doc.getMap("meta").get("version") !== NODE_DOCUMENT_VERSION
  )
    return;
  if (session.projection) {
    if (!plugin && !closing) {
      session.resourcesDirty = true;
      return session.projection;
    }
    await session.projection;
    return manager.project(documentId, plugin, guard, background, closing);
  }
  session.projection = (async () => {
    await manager.flushCache(documentId);
    await guard?.();
    const source = session.info.source!;
    const contracts = session.doc
      .getMap("node-tree:contracts")
      .toJSON() as ContentContractDictionary;
    const localized = await localizeDocumentResources(
      manager.resourceContext(session),
      readNodeDocument(session.doc),
      contracts
    );
    await guard?.();
    if (manager.sessions.get(documentId) !== session) throw new Error("原协作会话已变化");
    const result = await tauri.collabProjectContent({
      ...(plugin ? { plugin } : {}),
      documentId,
      contentId: source.contentId,
      content: localized.content,
      count: 0,
      contracts,
      expectedRevision: source.projectionRevision,
      expectedDocumentId: source.contentDocumentId,
      expectedSourceId: source.librarySourceId,
    });
    if (!result.projected) {
      if (background) {
        session.resourcesDirty = true;
        return;
      }
      throw new Error(
        result.reason === "library"
          ? "请切回原资料库完成共享正文保存"
          : "本机正文关联已变化，协作副本已保留"
      );
    }
    source.projectionRevision = result.revision;
    await manager.persist(session);
  })().finally(() => {
    session.projection = undefined;
  });
  return session.projection;
}
