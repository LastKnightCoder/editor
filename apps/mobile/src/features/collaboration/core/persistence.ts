import * as Y from "yjs";
import {
  readDocumentIdentity,
  validateNodeDocument,
  NODE_DOCUMENT_VERSION,
} from "@tau/collaboration";
import { bytesToBase64 } from "@tau/collaboration/src/encoding";
import * as tauri from "../../../services/tauri";
import { matchingInputDrafts, nodeRetentions } from "./retention";
import type { RuntimeSession } from "./types";
import type { CollaborationManager } from "./manager";
import { describeError } from "./utils";

/** 退出前等待同步的上限，超时后保留会话并拒绝退出。 */
const FLUSH_TIMEOUT_MS = 10_000;

export async function flushCache(manager: CollaborationManager, documentId: string) {
  const session = manager.sessions.get(documentId);
  if (session) await (session.saveError ? manager.persist(session) : session.writeTail);
}

export function preserveInputDraft(
  manager: CollaborationManager,
  documentId: string,
  draft: tauri.CachedInputDraft
) {
  const session = manager.sessions.get(documentId);
  if (!session) return Promise.reject(new Error("原协作副本尚未加载"));
  session.inputDrafts.set(JSON.stringify([draft.viewId, draft.nodeId, draft.field]), draft);
  return manager.persist(session);
}

export function persist(
  manager: CollaborationManager,
  session: RuntimeSession,
  update: Uint8Array = new Uint8Array()
) {
  if (update.byteLength) session.pendingUpdates.push(Uint8Array.from(update));
  const next = session.writeTail
    .catch(() => undefined)
    .then(async () => {
      const updates = session.pendingUpdates.slice();
      const drafts = [...session.inputDrafts.values()];
      const confirmedDrafts = matchingInputDrafts(session.doc, drafts);
      const bytes = bytesToBase64(updates.length ? Y.mergeUpdates(updates) : new Uint8Array());
      if (session.doc.getMap("meta").get("version") === NODE_DOCUMENT_VERSION)
        await validateNodeDocument(session.doc);
      for (const draft of drafts)
        await tauri.collabInputDraft({
          ...draft,
          documentId: session.info.id,
          baselineId: String(session.doc.getMap("meta").get("baselineId")),
          epoch: Number(session.doc.getMap("meta").get("epoch")),
        });
      await tauri.collabWriteCache({
        documentId: session.info.id,
        ...nodeRetentions(session.doc),
        state: bytes,
        confirmedDrafts,
        metadata: {
          ...session.info,
          close: session.close,
          baselineId: readDocumentIdentity(session.doc).baselineId,
          epoch: Number(session.doc.getMap("meta").get("epoch") ?? 0),
        },
      });
      session.pendingUpdates.splice(0, updates.length);
      for (const draft of confirmedDrafts) {
        const key = JSON.stringify([draft.viewId, draft.nodeId, draft.field]);
        if (session.inputDrafts.get(key)?.sequence === draft.sequence)
          session.inputDrafts.delete(key);
      }
      if (session.saveError) {
        session.info.frozen =
          session.saveError.frozen || Boolean(session.info.remoteVersionAvailable);
        if (!session.info.frozen) session.info.error = undefined;
        session.saveError = undefined;
        manager.changed();
        if (!manager.stopped && manager.sessions.get(session.info.id) === session)
          manager.attach(session);
      }
    });
  session.writeTail = next;
  void next.catch(failure => {
    session.saveError ??= { frozen: Boolean(session.info.frozen) };
    session.info.frozen = true;
    session.info.error = describeError(failure, "本机保存失败，当前输入仍保留，请勿关闭应用");
    manager.pauseProvider(session);
    manager.changed();
  });
  return next;
}

/** 等待同步；调用方在超时后检查状态，不放行尚未确认的改动。 */
export async function flush(manager: CollaborationManager, session: RuntimeSession) {
  await manager.flushCache(session.info.id);
  if (!session.assetsPending) {
    if (!session.provider) manager.attach(session, true);
    else session.provider.attach();
  }
  const provider = session.provider;
  if (!provider) return;
  const deadline = Date.now() + FLUSH_TIMEOUT_MS;
  while ((!provider.synced || provider.hasUnsyncedChanges) && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
