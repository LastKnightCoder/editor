import * as Y from "yjs";
import { createHash, randomUUID } from "node:crypto";
import {
  NODE_DOCUMENT_VERSION,
  ASSET_PREFIX,
  applyNodeDocumentUpdate,
  collectNodeDocumentResources,
  createNodeDocument,
  readNodeDocument,
  readDocumentIdentity,
  type DocumentStateResponse,
  type DocumentCloseReceipt,
} from "@tau/collaboration";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import databaseModule from "../database";
import { ContentDocumentTable } from "../tables/content-document";
import { ContentIdentityTable } from "../tables/content-identity";
import { bindingMatches } from "./content-repository";
import { getContentLength } from "@/utils/helper";
import { unregisterContentSession } from "./content-sessions";
import { localSessionId } from "./session-identity";
import type { RuntimeSession } from "./types";
import type { CollaborationManager } from "./index";

export async function prepareLeave(manager: CollaborationManager, session: RuntimeSession) {
  if (session.info.frozen) throw new Error("内容正在切换，请稍后重试");
  try {
    await manager.content.freeze(session);
    if (
      session.info.pending ||
      manager.assets.hasPending(session.info.id) ||
      session.provider?.hasUnsyncedChanges ||
      session.provider?.synced === false
    )
      throw new Error("仍有未同步改动，请等待同步后再退出");
    session.provider?.detach();
    if (session.info.role === "owner" && session.info.mode !== "local") {
      const { state, protocol } = await manager.client.request<DocumentStateResponse>(
        session.info.serverUrl,
        `/v1/documents/${session.info.id}/state`,
        "GET",
        undefined,
        NODE_DOCUMENT_VERSION
      );
      const bytes = Buffer.from(state, "base64");
      if (!protocol || createHash("sha256").update(bytes).digest("hex") !== protocol.revision)
        throw new Error("共享快照与协议修订不匹配，请重试结束共享");
      const identity = readDocumentIdentity(session.doc);
      if (
        protocol.id !== identity.documentId ||
        protocol.version !== identity.version ||
        protocol.epoch !== identity.epoch ||
        protocol.baselineId !== identity.baselineId
      )
        throw new Error("房间基线已变化，请重新打开共享正文");
      const candidate = await applyNodeDocumentUpdate(session.doc, bytes, identity);
      candidate.destroy();
      if (
        manager.content.activeSession(session.info.id) !== session ||
        session.info.status !== "active"
      )
        throw new Error("共享会话已变化，请重新打开正文");
      Y.applyUpdate(session.doc, bytes, session.provider);
      const resources = await manager.client.request<{ ids: string[] }>(
        session.info.serverUrl,
        `/v1/documents/${session.info.id}/assets`
      );
      await manager.preserveOwnerImages(
        session,
        resources.ids.map(id => ASSET_PREFIX + id)
      );
      for (const id of resources.ids)
        await manager.assets.localizeReference(
          session.info.serverUrl,
          session.info.id,
          ASSET_PREFIX + id
        );
      await manager.persistBeforeClose(session);
      manager.store.set(`close-revision:${session.info.id}`, protocol.revision);
    } else {
      const references = collectNodeDocumentResources(session.doc);
      for (const reference of references)
        if (reference.startsWith(ASSET_PREFIX))
          await manager.assets.localizeReference(
            session.info.serverUrl,
            session.info.id,
            reference
          );
    }
  } catch (error) {
    manager.content.unfreeze(session);
    if (!manager.assets.hasPending(session.info.id)) session.provider?.attach();
    throw error;
  }
}

/**
 * 结束共享后把当前正文与资源保存到本机，并创建独立的本机会话身份。
 */
export async function demoteSession(manager: CollaborationManager, session: RuntimeSession) {
  const source = session.info.source;
  if (!source) throw new Error("这段内容没有关联的本地内容，无法转为本机编辑");
  const db = databaseModule.getDatabase(source.databaseName);
  if (!db?.open) throw new Error("请打开原内容所在数据库以完成结束共享");
  const serverUrl = session.info.serverUrl;
  const previousId = session.info.id;
  if (session.doc.getMap("meta").get("version") === NODE_DOCUMENT_VERSION) {
    const nextId = localSessionId(db.name, source.contentId, source.contentCreatedAt);
    const body = manager.localRuntime;
    const target = { db, name: source.databaseName };
    if (!bindingMatches(db, source, previousId, serverUrl)) {
      // 主库已提交时可接续本机安装；较新的正文或另一个绑定仍由当前主库决定。
      body.restoreDemotion(target, nextId);
      await manager.removeSession(session);
      return;
    }
    const stored = ContentDocumentTable.read(db, source.contentId);
    if (!stored) throw new Error("CONTENT_FORMAT_UNSUPPORTED: 正文格式不受支持");
    const expectedRevision = source.projectionRevision;
    const librarySourceId = ContentIdentityTable.library(db)?.sourceId;
    if (
      !librarySourceId ||
      stored.revision !== expectedRevision ||
      (source.contentDocumentId && stored.documentId !== source.contentDocumentId) ||
      (source.librarySourceId && librarySourceId !== source.librarySourceId)
    )
      throw new Error("最终正文的来源或修订已变化，已保留共享副本");
    const contracts = session.doc
      .getMap("node-tree:contracts")
      .toJSON() as ContentContractDictionary;
    const value = await manager.assets.localizeDocument(
      serverUrl,
      previousId,
      readNodeDocument(session.doc),
      contracts
    );
    const baselineId = randomUUID(),
      epoch = Number(session.doc.getMap("meta").get("epoch")) + 1;
    const doc = await createNodeDocument(
      { documentId: nextId, baselineId, epoch },
      await manager.assets.prepareLocalDocument(nextId, value, contracts),
      contracts,
      { allowLocalResources: true }
    );
    try {
      if (!db.open || databaseModule.getDatabase(source.databaseName) !== db)
        throw new Error("资料库已切换，请在原资料库重试");
      db.transaction(() => {
        if (
          !bindingMatches(db, source, previousId, serverUrl) ||
          ContentIdentityTable.library(db)?.sourceId !== librarySourceId
        )
          throw new Error("正文绑定或资料库来源已变化");
        const committed = ContentDocumentTable.commit(
          db,
          source.contentId,
          { documentId: stored.documentId, contracts, content: value.content },
          {
            installDocument: true,
            expectedRevision,
            count: getContentLength(value.content as import("slate").Descendant[]),
          }
        );
        body.stageDemotion(
          {
            ...session.info,
            id: nextId,
            source: {
              ...source,
              librarySourceId,
              contentDocumentId: stored.documentId,
              projectionRevision: committed.revision,
            },
            mode: "local",
            serverUrl: "",
            ownerId: "local",
            role: "owner",
            status: "active",
            members: [],
            frozen: false,
            leaving: false,
            pending: false,
            error: undefined,
            connection: "connected",
          },
          doc
        );
        // 原房间已确认关闭。主库解绑一旦可见，下一次发布已拥有新代次。
        manager.store.db.transaction(() => {
          const marker = `close-generation:${previousId}`;
          if (manager.store.get(marker, false)) return;
          const generationKey = `generation:${source.databaseName}:${source.contentId}`;
          manager.store.set(generationKey, manager.store.get(generationKey, 0) + 1);
          manager.store.set(marker, true);
        })();
        db.prepare("DELETE FROM collaboration_bindings WHERE content_id=? AND document_id=?").run(
          source.contentId,
          previousId
        );
      })();
      if (!body.restoreDemotion(target, nextId)) throw new Error("本机正文尚未恢复，请重试");
      await manager.removeSession(session);
      return;
    } finally {
      doc.destroy();
    }
  }
  throw new Error("CONTENT_FORMAT_UNSUPPORTED: 正文格式不受支持");
}

/** 解除本地绑定并递增发布代次。discard=true（丢弃本地改动退出）时跳过最后的
 *  投影与进行中检查——丢弃语义下不应再写库，绑定清理必须尽力完成。 */
export async function clearBinding(
  manager: CollaborationManager,
  session: RuntimeSession,
  discard = false
) {
  const source = session.info.source;
  if (!source) return;
  const db = databaseModule.getDatabase(source.databaseName);
  if (!db?.open) throw new Error("请打开原内容所在数据库以完成退出");
  if (!session.info.frozen) await manager.content.freeze(session);
  if (!discard && manager.content.isProjecting(session))
    throw new Error("内容正在保存，请稍后再重试");
  // 原内容已不再由这份共享绑定（被删除重建 / 改绑其它共享）：没有可写回的对象，
  // 直接解除本共享的残留记录——否则写回必然失败，清理永远卡住
  const bound = bindingMatches(db, source, session.info.id, session.info.serverUrl);
  if (!discard && bound) await manager.content.project(session);
  db.prepare("DELETE FROM collaboration_bindings WHERE content_id=? AND document_id=?").run(
    source.contentId,
    session.info.id
  );
  manager.store.set(
    "generation:" + source.databaseName + ":" + source.contentId,
    manager.store.get("generation:" + source.databaseName + ":" + source.contentId, 0) + 1
  );
  session.info.source = undefined;
  unregisterContentSession(session);
}

export async function discardLocal(manager: CollaborationManager, session: RuntimeSession) {
  if (session.info.source) await manager.clearBinding(session);
  await manager.removeSession(session);
}

export async function removeSession(manager: CollaborationManager, session: RuntimeSession) {
  manager.remoteDocuments.get(session.info.serverUrl)?.delete(session.info.id);
  await manager.content.removeSession(session);
}

export async function revoke(
  manager: CollaborationManager,
  session: RuntimeSession,
  reason: "closed" | "revoked"
) {
  if (session.info.leaving) return;
  session.provider?.detach();
  session.info.status = "closed";
  session.info.connection = "offline";
  session.info.error = reason === "closed" ? "作者已结束共享" : "访问权限已被移除";
  if (session.info.source) {
    try {
      await manager.clearBinding(session);
    } catch {
      manager.content.changed(session);
      return;
    }
  }
  if (session.info.pending) {
    manager.content.changed(session);
    return;
  }
  await manager.removeSession(session);
}

export async function finishLeave(manager: CollaborationManager, session: RuntimeSession) {
  const closingId = session.info.id;
  if (manager.finishingLeaves.has(closingId)) return;
  manager.finishingLeaves.add(closingId);
  const closeConfirmed = manager.store.get(`close-confirmed:${closingId}`, false);
  const closeAttempted = manager.store.get(`close-attempted:${closingId}`, false);
  let reopen = !closeConfirmed && !closeAttempted;
  try {
    if (session.info.role === "owner") {
      if (!closeConfirmed) {
        const revision = manager.store.get<string | undefined>(
          `close-revision:${closingId}`,
          undefined
        );
        if (!revision) throw new Error("尚未确认最终共享快照，请重新结束共享");
        if (!closeAttempted) {
          await manager.persistBeforeClose(session);
          manager.store.set(`close-attempted:${closingId}`, true);
        }
        reopen = false;
        const path = `/v1/documents/${closingId}`;
        const receipt = await manager.client
          .request<DocumentCloseReceipt>(session.info.serverUrl, `${path}/close`, "POST", {
            expectedRevision: revision,
          })
          .catch(async (error: unknown) => {
            if ((error as { code?: string } | null)?.code === "REVISION_CONFLICT") {
              // 关闭终态也可能返回修订冲突，只有确认房间仍活动才解冻。
              reopen = await manager.client
                .request(session.info.serverUrl, `${path}/protocol`)
                .then(
                  () => true,
                  () => false
                );
            }
            throw error;
          });
        if (receipt?.ok !== true || receipt.revision !== revision)
          throw new Error("关闭回执未确认，稍后按原修订重试");
        manager.store.set(`close-confirmed:${closingId}`, true);
      }
      // 原正文仍存在时安装本机会话，否则只拆除共享会话。
      if (session.info.source) {
        await manager.demoteSession(session);
        manager.content.unfreeze(session);
      } else await manager.removeSession(session);
    } else {
      await manager.client.request(
        session.info.serverUrl,
        `/v1/documents/${session.info.id}/leave`,
        "POST",
        {}
      );
      await manager.removeSession(session);
    }
  } catch (error) {
    if (reopen) {
      session.info.leaving = false;
      manager.store.delete(`close-revision:${closingId}`);
      manager.store.delete(`close-attempted:${closingId}`);
      manager.content.unfreeze(session);
      if (!manager.assets.hasPending(closingId)) session.provider?.attach();
    }
    session.info.error = error instanceof Error ? error.message : "正在等待退出完成";
    manager.content.changed(session);
  } finally {
    manager.finishingLeaves.delete(closingId);
  }
}

export async function persistBeforeClose(manager: CollaborationManager, session: RuntimeSession) {
  if (manager.content.isProjecting(session)) throw new Error("正文正在保存，请稍后重试");
  const source = session.info.source;
  if (!source) throw new Error("原正文关联缺失，请打开原资料库后重试结束共享");
  if (!databaseModule.getDatabase(source.databaseName)?.open)
    throw new Error("请打开原内容所在数据库以完成结束共享");
  await manager.content.project(session);
  if (manager.content.activeSession(session.info.id) !== session || session.projectionDirty)
    throw new Error("最终正文尚未确认保存，请重试结束共享");
  manager.store.compact(session.info.id, session.doc);
  manager.store.metadata(session.info);
}
