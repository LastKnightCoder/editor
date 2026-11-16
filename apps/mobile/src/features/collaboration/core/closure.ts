import * as Y from "yjs";
import {
  readDocumentIdentity,
  applyNodeDocumentUpdate,
  NODE_DOCUMENT_VERSION,
} from "@tau/collaboration";
import { base64ToBytes } from "@tau/collaboration/src/encoding";
import * as tauri from "../../../services/tauri";
import * as rest from "./rest";
import { clearCachedInvitation } from "./invitation-cache";
import type { CollaborationManager } from "./manager";
import { describeError, sha256Hex } from "./utils";

/** 结束共享的请求与回执耐久保存；未知结果只按原修订重试，不能恢复编辑。 */
export function leave(manager: CollaborationManager, documentId: string): Promise<void> {
  const pending = manager.leaves.get(documentId);
  if (pending) return pending;
  const task = manager.leaveSession(documentId).finally(() => {
    if (manager.leaves.get(documentId) === task) manager.leaves.delete(documentId);
  });
  manager.leaves.set(documentId, task);
  return task;
}

export async function leaveSession(manager: CollaborationManager, documentId: string) {
  let session = manager.sessions.get(documentId);
  const recovery = await tauri.collabRecovery(documentId);
  if (recovery?.close) {
    if (session) {
      session.close = recovery.close;
      session.info.leaving = true;
      manager.pauseProvider(session);
      manager.changed();
    }
    return manager.finishClose(recovery);
  }
  session ??= await manager.opening.get(documentId);
  const room = manager.rooms.get(documentId);
  if (!session && room?.kind === "content" && room.protocolVersion === NODE_DOCUMENT_VERSION)
    session = await manager.openSession(room);
  if (!session) return;
  if (session.close?.confirmed)
    return manager.finishClose({
      ...session.info,
      close: session.close,
      baselineId: String(session.doc.getMap("meta").get("baselineId")),
      epoch: Number(session.doc.getMap("meta").get("epoch")),
    });
  const check = () => {
    if (manager.sessions.get(documentId) !== session || manager.stopped)
      throw new Error("结束共享的原会话已变化");
  };
  check();
  session.info.leaving = true;
  manager.changed();
  try {
    await manager.processResources(session);
    await session.projection;
    check();
    await manager.flush(session);
    check();
    if (!session.provider?.synced || session.provider.hasUnsyncedChanges || session.assetsPending)
      throw new Error("COLLAB_UNSYNCED: 改动尚未同步完成，请稍后再试");
    if (session.inputDrafts.size) throw new Error("还有尚未提交的编辑，请完成输入后再结束共享");
    manager.pauseProvider(session);
    if (session.info.role === "owner") {
      if (!session.info.source?.librarySourceId)
        throw new Error("原正文关联缺失，请恢复原正文关联后再结束共享");
      const { state, protocol } = await rest.getDocumentState(session.info.serverUrl, documentId);
      const bytes = base64ToBytes(state);
      if (!protocol || (await sha256Hex(bytes)) !== protocol.revision)
        throw new Error("共享快照与协议修订不匹配，请重试结束共享");
      check();
      const identity = readDocumentIdentity(session.doc);
      if (
        protocol.id !== identity.documentId ||
        protocol.version !== identity.version ||
        protocol.baselineId !== identity.baselineId ||
        protocol.epoch !== identity.epoch
      )
        throw new Error("房间基线已变化，请重新打开共享正文");
      const candidate = await applyNodeDocumentUpdate(session.doc, bytes, identity);
      candidate.destroy();
      check();
      Y.applyUpdate(session.doc, bytes, session.provider);
      const assets = await rest.listAssets(session.info.serverUrl, documentId);
      await tauri.collabResource(
        manager.resourceContext(session),
        "localize",
        assets.ids.map(id => `tau-collab-asset:${id}`)
      );
      await manager.flushCache(documentId);
      check();
      await manager.project(documentId, undefined, undefined, false, true);
      check();
      session.close = { revision: protocol.revision, confirmed: false };
      try {
        await manager.persist(session);
      } catch (failure) {
        session.close = undefined;
        throw failure;
      }
      await manager.finishClose({
        ...session.info,
        close: session.close,
        baselineId: protocol.baselineId,
        epoch: protocol.epoch,
      });
    } else {
      await manager.project(documentId, undefined, undefined, false, true);
      await rest.leaveDocument(session.info.serverUrl, documentId);
      session.info.status = "closed";
      await manager.persist(session);
      await manager.clearLocalBindings(documentId);
      await tauri.collabResource(manager.resourceContext(session), "release");
      manager.rooms.delete(documentId);
      manager.disposeSession(documentId);
    }
  } catch (failure) {
    if (!session.close) {
      session.info.leaving = false;
      if (!session.info.frozen && !session.assetsPending) session.provider?.attach();
    }
    session.info.error = describeError(failure, "结束或退出共享尚未完成，请稍后重试");
    manager.changed();
    throw failure;
  }
}

export async function finishClose(
  manager: CollaborationManager,
  record: tauri.CachedContentSession
) {
  const { id, serverUrl, source, close } = record;
  if (!close || !source?.librarySourceId) throw new Error("关闭恢复记录不完整，原数据已保留");
  const session = manager.sessions.get(id);
  try {
    if (!close.confirmed) {
      const receipt = await rest.closeDocument(serverUrl, id, close.revision);
      if (receipt?.ok !== true || receipt.revision !== close.revision)
        throw new Error("关闭回执未确认，稍后按原修订重试");
      await tauri.collabRecovery(id, "confirm-close");
      close.confirmed = true;
    }
    if (session) {
      session.close = close;
      session.info.status = "closed";
    }
    await tauri.collabUnbindContent(source.contentId, {
      documentId: id,
      sourceId: source.librarySourceId,
    });
    await tauri.collabResource({ serverUrl, documentId: id }, "release");
    await tauri.collabRecovery(id, "release");
    manager.rooms.delete(id);
    manager.disposeSession(id);
    clearCachedInvitation(id);
  } catch (failure) {
    const code =
      typeof failure === "object" && failure ? (failure as { code?: string }).code : undefined;
    if (
      !close.confirmed &&
      (code === "REVISION_CONFLICT" || /^COLLAB_REVISION_CONFLICT:/.test(String(failure)))
    ) {
      // 只有确认房间仍活动，才能把修订冲突作为可重新编辑的失败。
      await rest.getDocumentProtocol(serverUrl, id);
      await tauri.collabRecovery(id, "clear-close");
      if (session) {
        session.close = undefined;
        session.info.leaving = false;
        if (!session.info.frozen) session.provider?.attach();
      }
    }
    if (session)
      session.info.error = describeError(failure, "共享收尾尚未完成，正在保留原副本重试");
    manager.changed();
    throw failure;
  }
}

/** 解除该房间的本地绑定（仅本机发起时存在）并清理协作码缓存；失败不阻塞退出，
 *  残留绑定由投影通道的漂移检测兜底清理。 */
export async function clearLocalBindings(_manager: CollaborationManager, documentId: string) {
  try {
    const bindings = await tauri.collabListBindings();
    const mine = bindings.filter(binding => binding.documentId === documentId);
    for (const binding of mine) await tauri.collabUnbindContent(binding.contentId, { documentId });
  } catch {
    // 忽略：绑定残留可被投影漂移检测清理
  }
  clearCachedInvitation(documentId);
}
