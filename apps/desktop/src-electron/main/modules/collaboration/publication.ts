import * as Y from "yjs";
import { createHash, randomUUID } from "node:crypto";
import type { IpcMainInvokeEvent } from "electron";
import {
  NODE_DOCUMENT_VERSION,
  replaceText,
  createNodeDocument,
  validateNodeDocument,
  readNodeDocument,
  type CollaborationSession,
  type SourceType,
} from "@tau/collaboration";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import databaseModule from "../database";
import { ContentDocumentTable } from "../tables/content-document";
import { ContentIdentityTable } from "../tables/content-identity";
import { planClosedReshare } from "./content-repository";
import { findCollaborationBinding } from "../collaboration-guard";
import { getContentLength } from "@/utils/helper";
import { contentRevision, registerContentSession } from "./content-sessions";
import type { RuntimeSession } from "./types";
import type { CollaborationManager } from "./index";

export async function createContent(
  manager: CollaborationManager,
  event: IpcMainInvokeEvent,
  contentId: number,
  sourceType?: SourceType,
  sourceId?: number,
  sourceTitle?: string
) {
  if (!Number.isSafeInteger(contentId) || contentId <= 0) throw new Error("内容 ID 不合法");
  const { name } = manager.content.databaseForEvent(event);
  const key = `${name}:${contentId}`;
  let operation = manager.pendingCreates.get(key);
  if (!operation) {
    operation = (async () => {
      const body = manager.localRuntime;
      let snapshot = await body.open(event, {
        contentId,
        sourceType,
        sourceId,
        sourceTitle,
      });
      let local =
        snapshot.mode === "local"
          ? body.getSession(snapshot.documentId)
          : manager.content.requireSession(snapshot.documentId);
      // 命中结束共享的残留会话：先写回本地并拆除（同「清理本地记录」），再重走创建，
      // 否则会按「恢复共享」对已删的服务器文档重新签码
      const reshare = snapshot.mode !== "local" ? planClosedReshare(local.info) : null;
      if (reshare) {
        if (reshare.action === "reject") throw new Error(reshare.reason);
        await manager.discardLocal(local);
        snapshot = await body.open(event, {
          contentId,
          sourceType,
          sourceId,
          sourceTitle,
        });
        local =
          snapshot.mode === "local"
            ? body.getSession(snapshot.documentId)
            : manager.content.requireSession(snapshot.documentId);
      }
      if (snapshot.mode !== "local") {
        const invitation = await manager.issueInvitation(local.info.serverUrl, local.info.id);
        return { documentId: local.info.id, code: invitation.code };
      }
      try {
        if (!local.info.frozen) await body.prepareShare(local);
        else if (!body.pendingShare(local.info.id))
          throw new Error("正文已暂停编辑，请等待当前保存或共享操作完成");
        if (sourceType !== "card" && sourceTitle !== undefined)
          replaceText(local.doc.getText("title"), sourceTitle.slice(0, 500));
        await body.save(local);
        const result = await manager.publishSession(event, local, {
          contentId,
          sourceType,
          sourceId,
          sourceTitle: local.doc.getText("title").toString(),
        });
        return result;
      } catch (failure) {
        // 共享尚未提交时解除输入冻结
        if (body.find(local.info.id) === local && !body.pendingShare(local.info.id))
          body.cancelShare(local);
        throw failure;
      }
    })().finally(() => {
      manager.pendingCreates.delete(key);
      void manager.refresh();
    });
    manager.pendingCreates.set(key, operation);
  }
  return operation;
}

/** 首次共享固定当前正文候选，提交失败沿原房间身份重试。 */
export async function publishSession(
  manager: CollaborationManager,
  event: IpcMainInvokeEvent,
  session: RuntimeSession,
  target: { contentId: number; sourceType?: SourceType; sourceId?: number; sourceTitle?: string }
) {
  if (session.doc.getMap("meta").get("version") !== NODE_DOCUMENT_VERSION)
    throw new Error("正文格式不受支持，无法发起共享");
  const { db, name } = manager.content.databaseForEvent(event);
  const stored = ContentDocumentTable.read(db, target.contentId);
  const source = session.info.source;
  if (!stored || !source || source.databaseName !== name || source.contentId !== target.contentId)
    throw new Error("原正文关联已变化");
  const url = manager.serverUrl;
  const identity = await manager.client.identity(url);
  const previousId = session.info.id;
  const body = manager.localRuntime;
  let prepared = body.pendingShare(previousId);
  if (!prepared) {
    const idempotencyKey = createHash("sha256")
      .update(
        JSON.stringify({
          documentId: stored.documentId,
          library: ContentIdentityTable.library(db)?.sourceId,
          server: url,
          generation: manager.store.get(`generation:${name}:${target.contentId}`, 0),
        })
      )
      .digest("hex");
    const created = await manager.client.request<{ id: string }>(url, "/v1/documents", "POST", {
      idempotencyKey,
    });
    const contracts = session.doc
      .getMap("node-tree:contracts")
      .toJSON() as ContentContractDictionary;
    const baselineId = randomUUID();
    const value = await manager.assets.shareDocument(
      url,
      previousId,
      created.id,
      readNodeDocument(session.doc),
      contracts
    );
    const candidate = await createNodeDocument(
      { documentId: created.id, baselineId, epoch: 0 },
      value,
      contracts
    );
    try {
      prepared = {
        documentId: created.id,
        baselineId,
        state: Buffer.from(Y.encodeStateAsUpdate(candidate)).toString("base64"),
        revision: contentRevision(session),
        serverUrl: url,
      };
      body.rememberShare(previousId, prepared);
    } finally {
      candidate.destroy();
    }
  }
  if (prepared.serverUrl !== url || prepared.revision !== contentRevision(session))
    throw new Error("共享准备后原正文已变化，原状态已保留，请重新打开后重试");
  await manager.client.request(url, `/v1/documents/${prepared.documentId}/publish`, "POST", {
    state: prepared.state,
  });
  const remote = await manager.client.request<{ state: string }>(
    url,
    `/v1/documents/${prepared.documentId}/state`,
    "GET",
    undefined,
    NODE_DOCUMENT_VERSION
  );
  const existing = manager.content.activeSession(prepared.documentId);
  const doc = existing?.doc ?? new Y.Doc({ gc: false });
  try {
    Y.applyUpdate(doc, Buffer.from(remote.state, "base64"), existing?.provider);
    await validateNodeDocument(doc, {
      documentId: prepared.documentId,
      baselineId: prepared.baselineId,
      epoch: 0,
    });
    const value = await manager.assets.localizeDocument(
      url,
      prepared.documentId,
      readNodeDocument(doc),
      doc.getMap("node-tree:contracts").toJSON() as ContentContractDictionary
    );
    if (!db.open || databaseModule.getDatabase(name) !== db)
      throw new Error("资料库已切换，共享结果待恢复");
    const info: CollaborationSession = {
      ...session.info,
      id: prepared.documentId,
      mode: "shared",
      serverUrl: url,
      ownerId: identity.id,
      role: "owner",
      source,
      pending: existing?.info.pending ?? false,
      frozen: false,
      leaving: false,
      connection: "connecting",
      error: undefined,
    };
    db.transaction(() => {
      const current = ContentDocumentTable.read(db, source.contentId);
      const binding = findCollaborationBinding(db, source.contentId);
      if (binding && binding.document_id !== prepared!.documentId)
        throw new Error("正文已关联另一份共享");
      if (!current || current.documentId !== stored.documentId) throw new Error("原正文身份已变化");
      ContentDocumentTable.commit(
        db,
        source.contentId,
        {
          documentId: stored.documentId,
          contracts: doc.getMap("node-tree:contracts").toJSON() as ContentContractDictionary,
          content: value.content,
        },
        {
          installDocument: true,
          expectedRevision: stored.revision,
          count: getContentLength(value.content as import("slate").Descendant[]),
        }
      );
      db.prepare("INSERT OR REPLACE INTO collaboration_bindings VALUES (?,?,?,?,?,?,?)").run(
        source.contentId,
        source.contentCreatedAt,
        url,
        prepared!.documentId,
        source.sourceType ?? null,
        source.sourceId ?? null,
        source.sourceTitle ?? null
      );
    })();
    source.projectionRevision = ContentDocumentTable.read(db, source.contentId)!.revision;
    if (existing) {
      Object.assign(existing.info, info);
      manager.store.metadata(existing.info);
      registerContentSession(db, source.contentId, existing);
    } else {
      // 刚发布的房间以远端确认快照为准，同 ID 的冷缓存只可能是旧残留
      manager.store.discard(info.id, "发布时发现同房间的旧缓存");
      source.projectionRevision = ContentDocumentTable.read(db, source.contentId)!.revision;
      manager.content.install(info, doc);
    }
    await body.finishPublishedShare(previousId, source, {
      documentId: prepared.documentId,
      baselineId: prepared.baselineId,
      epoch: 0,
      serverUrl: url,
    });
    manager.content.changed();
    return { documentId: info.id, code: (await manager.issueInvitation(url, info.id)).code };
  } catch (failure) {
    if (!existing && manager.content.activeSession(prepared.documentId)?.doc !== doc) doc.destroy();
    throw failure;
  }
}

/** 服务器只存码的哈希，明文仅签发时返回一次：缓存到本机供作者随时重新复制 */
export async function issueInvitation(
  manager: CollaborationManager,
  serverUrl: string,
  documentId: string
) {
  const invitation = await manager.client.request<{ code: string; expiresAt: number }>(
    serverUrl,
    `/v1/documents/${encodeURIComponent(documentId)}/invitation`,
    "POST",
    {}
  );
  manager.store.set(`invitation:${documentId}`, invitation);
  return invitation;
}
