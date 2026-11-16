import * as Y from "yjs";
import { createNodeDocument, type ContentNode, type SourceBinding } from "@tau/collaboration";
import { bytesToBase64 } from "@tau/collaboration/src/encoding";
import * as tauri from "../../../services/tauri";
import * as rest from "./rest";
import { prepareDocumentResources } from "./resources";
import { nodeRetentions } from "./retention";
import { readCachedInvitation, writeCachedInvitation } from "./invitation-cache";
import type { CollaborationManager } from "./manager";
import { sha256Hex } from "./utils";

/** 发布当前正文与契约，发布中的快照先保存在本机，重试复用同一房间。 */
export async function shareContent(
  manager: CollaborationManager,
  source: {
    contentId: number;
    title: string;
    content: unknown[];
    bannerBg?: string;
    bannerPosition?: string;
    sourceType?: string;
    sourceId?: number;
  },
  guard?: () => void,
  expectedRef?: string
): Promise<{ documentId: string; code: string; expiresAt: number }> {
  guard?.();
  await manager.whenReady();
  guard?.();
  const detail = await tauri.getContentDetail(source.contentId);
  if (!detail.contracts || !detail.documentId || !detail.librarySourceId || !detail.revision)
    throw new Error("正文格式不受支持，无法发起共享");
  if (JSON.stringify(detail.content) !== JSON.stringify(source.content))
    throw new Error("本机编辑尚未确认保存，请保存后重试共享");
  guard?.();
  if (expectedRef && `${detail.contentId}:${detail.createTime}` !== expectedRef)
    throw new Error("正文身份已变化，请重新打开");
  const existing = await tauri.collabGetBinding(source.contentId);
  guard?.();
  let documentId = existing?.documentId;
  if (existing && existing.serverUrl !== manager.serverUrl)
    throw new Error("正文仍绑定另一协作服务，请先结束原共享");
  if (!documentId) {
    const previous = (await tauri.collabListCache())
      .filter(
        item =>
          item.serverUrl === manager.serverUrl &&
          item.source?.contentDocumentId === detail.documentId &&
          item.source?.librarySourceId === detail.librarySourceId
      )
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    guard?.();
    const pending = previous?.status === "active" ? previous : undefined;
    if (pending) documentId = pending.id;
    else {
      const key = await sha256Hex(
        new TextEncoder().encode(
          JSON.stringify([
            "tau-mobile",
            manager.serverUrl,
            detail.librarySourceId,
            detail.documentId,
            previous?.id ?? "initial",
          ])
        )
      );
      guard?.();
      documentId = (await rest.createDocument(manager.serverUrl, key)).id;
      guard?.();
    }
    let cached = await tauri.collabReadCache(documentId);
    guard?.();
    if (!cached) {
      const context = { serverUrl: manager.serverUrl, documentId };
      const prepared = await prepareDocumentResources(
        context,
        {
          title: source.title,
          content: detail.content as ContentNode[],
          bannerBg: source.bannerBg ?? "",
          bannerPosition: source.bannerPosition ?? "center",
        },
        detail.contracts
      );
      guard?.();
      const doc = await createNodeDocument(
        { documentId, baselineId: crypto.randomUUID(), epoch: 0 },
        prepared,
        detail.contracts
      );
      try {
        guard?.();
        const metadata: tauri.CachedContentSession = {
          id: documentId,
          baselineId: String(doc.getMap("meta").get("baselineId")),
          epoch: 0,
          serverUrl: manager.serverUrl,
          mode: "shared",
          ownerId: manager.deviceId!,
          role: "owner",
          status: "active",
          title: source.title,
          members: [],
          updatedAt: Date.now(),
          connection: "offline",
          pending: true,
          leaving: false,
          source: {
            databaseName: detail.librarySourceId,
            contentId: detail.contentId,
            contentCreatedAt: detail.createTime,
            librarySourceId: detail.librarySourceId,
            contentDocumentId: detail.documentId,
            projectionRevision: detail.revision,
            sourceType: source.sourceType as SourceBinding["sourceType"],
            sourceId: source.sourceId,
            sourceTitle: source.title,
          },
        };
        await tauri.collabWriteCache(
          {
            documentId,
            ...nodeRetentions(doc),
            metadata,
            state: bytesToBase64(Y.encodeStateAsUpdate(doc)),
          },
          true
        );
      } finally {
        doc.destroy();
      }
      guard?.();
      cached = await tauri.collabReadCache(documentId);
    }
    guard?.();
    if (!cached || cached.metadata.source?.projectionRevision !== detail.revision)
      throw new Error("待发布副本与本机正文已变化，原发布快照已保留");
    await tauri.collabResource({ serverUrl: manager.serverUrl, documentId }, "flush");
    guard?.();
    await rest.publishDocument(manager.serverUrl, documentId, cached.state);
    guard?.();
    await tauri.collabBindContent({
      ...source,
      documentId,
      serverUrl: manager.serverUrl,
      expectedDocumentId: detail.documentId,
      expectedSourceId: detail.librarySourceId,
      expectedRevision: detail.revision,
    });
  }
  guard?.();
  await manager.openDocument(documentId);
  guard?.();
  await manager.project(documentId, undefined, async () => {
    guard?.();
  });
  guard?.();
  const invitation =
    readCachedInvitation(documentId) ??
    (await rest.rotateInvitation(manager.serverUrl, documentId));
  guard?.();
  writeCachedInvitation(documentId, invitation);
  return { documentId, ...invitation };
}
