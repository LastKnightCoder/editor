import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import {
  readDocumentIdentity,
  validateNodeDocument,
  NODE_DOCUMENT_VERSION,
  type SharedDocumentInfo,
} from "@tau/collaboration";
import { base64ToBytes, bytesToBase64 } from "@tau/collaboration/src/encoding";
import * as tauri from "../../../services/tauri";
import * as rest from "./rest";
import { registerContentResourceSource } from "./resources";
import { matchingInputDrafts, nodeRetentions } from "./retention";
import { pushCollaborationNotice, useCollaborationStore } from "./store";
import type { RuntimeSession } from "./types";
import type { CollaborationManager } from "./manager";
import { canRetryRead, describeError } from "./utils";

const DOCUMENT_STATE_MAX_ATTEMPTS = 3;
// 持久化在每次输入后触发，持续失败时每个会话只留首条
const persistFailureLogged = new WeakSet<RuntimeSession>();

export async function reconnect(manager: CollaborationManager, documentId: string) {
  const session = manager.sessions.get(documentId);
  if (!session || session.info.status !== "active" || session.info.leaving) return;
  try {
    await manager.flushCache(documentId);
    await manager.refreshProtocol(session);
  } catch (failure) {
    session.info.connection = "error";
    session.info.error = describeError(failure, "协作重连失败，请稍后重试");
    manager.changed();
    return;
  }
  if (session.info.frozen || manager.sessions.get(documentId) !== session) return;
  manager.pauseProvider(session);
  session.info.connection = "connecting";
  session.info.error = undefined;
  manager.attach(session);
  manager.changed();
}

/** 建立或刷新会话（幂等）：已存在的会话只合并服务端权威字段，
 *  并发调用（列表刷新 + 编辑页补建）按 documentId 去重，避免覆盖出双份 Y.Doc。 */
export async function openSession(
  manager: CollaborationManager,
  info: SharedDocumentInfo
): Promise<RuntimeSession> {
  manager.pendingJoins.delete(info.id);
  const existing = manager.sessions.get(info.id);
  if (existing) {
    if (existing.info.leaving) return existing;
    // 运行时字段（连接态/待同步/退出中）以本地为准，其余取服务端权威值
    existing.info = {
      ...existing.info,
      ...info,
      connection: existing.info.connection,
      pending: existing.info.pending,
      leaving: existing.info.leaving,
    };
    await manager.refreshProtocol(existing);
    manager.changed();
    // 换代重建后返回新会话
    return manager.sessions.get(info.id) ?? existing;
  }
  let pending = manager.opening.get(info.id);
  if (!pending) {
    pending = manager.createSession(info).finally(() => manager.opening.delete(info.id));
    manager.opening.set(info.id, pending);
  }
  return pending;
}

export async function refreshProtocol(
  manager: CollaborationManager,
  session: RuntimeSession
): Promise<void> {
  const protocol = await rest.getDocumentProtocol(session.info.serverUrl, session.info.id);
  if (manager.sessions.get(session.info.id) !== session || manager.stopped) return;
  const meta = session.doc.getMap("meta");
  if (
    protocol.version === meta.get("version") &&
    protocol.epoch === Number(meta.get("epoch") ?? 0) &&
    protocol.baselineId === meta.get("baselineId")
  )
    return;
  if (protocol.version !== NODE_DOCUMENT_VERSION) {
    // 协作端是更新版本应用写入的格式：权威数据，不能用旧客户端改写
    session.info.frozen = true;
    session.info.error = "协作端需要更新版本的应用，请升级后再编辑";
    session.provider?.destroy();
    session.provider = null;
    manager.changed();
    return;
  }
  await manager.rebuildSession(session, "协作端基线已变化");
}

/** 远端已换代的活跃会话：备份本机缓存后按服务器内容原位换成新会话，编辑页随会话切换重新绑定。 */
export async function rebuildSession(
  manager: CollaborationManager,
  session: RuntimeSession,
  reason: string
) {
  const { id } = session.info;
  session.provider?.destroy();
  session.provider = null;
  session.detachDocListener?.();
  session.releaseResourceSource?.();
  session.awareness.setLocalState(null);
  await session.writeTail.catch(() => undefined);
  if (manager.sessions.get(id) !== session) return;
  manager.sessions.delete(id);
  const cached = await tauri.collabReadCache(id);
  if (cached) await manager.discardCache(session.info, reason);
  const { connection: _connection, pending: _pending, leaving: _leaving, ...info } = session.info;
  const next = manager
    .createSession(info as SharedDocumentInfo)
    .finally(() => manager.opening.delete(id));
  manager.opening.set(id, next);
  try {
    await next;
  } catch (failure) {
    // 重建失败（如离线）：列表刷新或编辑页重试会再次按服务器内容建立
    manager.changed();
    throw failure;
  }
}

export async function createSession(
  manager: CollaborationManager,
  info: SharedDocumentInfo
): Promise<RuntimeSession> {
  if (manager.stopped) throw new Error("COLLAB_STOPPED: 协作运行时已停止");
  const listed = manager.rooms.has(info.id);
  let cached = await tauri.collabReadCache(info.id);
  const recovery = await tauri.collabRecovery(info.id);
  if (recovery && recovery.serverUrl !== manager.serverUrl)
    throw new Error("共享恢复记录属于另一服务器");
  // 本机发起的共享要把内容投影回原正文：重建缓存时沿用原来源绑定
  const source = recovery?.source ?? cached?.metadata.source;
  const close = recovery?.close ?? cached?.metadata.close;
  if (close) throw new Error("共享正在收尾，已保留原正文并自动重试");
  let doc = new Y.Doc({ guid: info.id, gc: false });
  try {
    if (cached) {
      try {
        Y.applyUpdate(doc, base64ToBytes(cached.state));
        for (const update of cached.updates) Y.applyUpdate(doc, base64ToBytes(update));
        await validateNodeDocument(doc, {
          documentId: info.id,
          baselineId: String(doc.getMap("meta").get("baselineId")),
          epoch: Number(doc.getMap("meta").get("epoch")),
        });
      } catch (failure) {
        doc.destroy();
        doc = new Y.Doc({ guid: info.id, gc: false });
        cached = await manager.discardCache(info, describeError(failure, "本机缓存不可读"));
      }
    }
    try {
      const { state } = await manager.loadState(info.id);
      const remote = new Y.Doc({ gc: false });
      try {
        Y.applyUpdate(remote, base64ToBytes(state));
        await validateNodeDocument(remote, {
          documentId: info.id,
          baselineId: String(remote.getMap("meta").get("baselineId")),
          epoch: Number(remote.getMap("meta").get("epoch")),
        });
        if (
          cached &&
          ["version", "baselineId", "epoch"].some(
            key => doc.getMap("meta").get(key) !== remote.getMap("meta").get(key)
          )
        ) {
          // 远端已换代：旧缓存不能合入新基线，备份后按服务器内容重建
          doc.destroy();
          doc = new Y.Doc({ guid: info.id, gc: false });
          cached = await manager.discardCache(info, "协作端基线已变化");
        }
        Y.applyUpdate(doc, base64ToBytes(state));
      } finally {
        remote.destroy();
      }
    } catch (failure) {
      if (!cached || !canRetryRead(failure)) throw failure;
    }
    if (manager.stopped) throw new Error("COLLAB_STOPPED: 协作运行时已停止");
    const session: RuntimeSession = {
      inputDrafts: new Map(
        (cached?.inputDrafts ?? []).map(draft => [
          JSON.stringify([draft.viewId, draft.nodeId, draft.field]),
          draft,
        ])
      ),
      info: {
        ...cached?.metadata,
        ...(source ? { source } : {}),
        ...(manager.rooms.get(info.id) ?? info),
        serverUrl: manager.serverUrl,
        mode: "shared",
        connection: "connecting",
        pending: cached?.metadata.pending ?? false,
        leaving: Boolean(close),
        frozen: false,
        remoteVersionAvailable: false,
        error: undefined,
      },
      doc,
      awareness: new Awareness(doc),
      provider: null,
      writeTail: Promise.resolve(),
      pendingUpdates: [],
      nodeViews: {},
      resourcesDirty: true,
      close,
    };
    await tauri.collabWriteCache(
      {
        documentId: info.id,
        ...nodeRetentions(doc),
        metadata: {
          ...session.info,
          close,
          baselineId: readDocumentIdentity(doc).baselineId,
          epoch: Number(doc.getMap("meta").get("epoch") ?? 0),
        },
        state: bytesToBase64(Y.encodeStateAsUpdate(doc)),
        expectedRevision: cached?.revision,
        confirmedDrafts: matchingInputDrafts(doc, [...session.inputDrafts.values()]),
      },
      true
    );
    session.nodeViews = await tauri.collabNodeViews(info.id);
    session.assetsPending = await tauri.collabResource<boolean>(
      manager.resourceContext(session),
      "pending"
    );
    if (manager.stopped || (listed && !manager.rooms.has(info.id))) {
      session.awareness.destroy();
      throw new Error("COLLAB_NOT_FOUND: 协作会话已失效，请重新打开");
    }
    const onDocUpdate = (update: Uint8Array) => {
      session.resourcesDirty = true;
      void manager.persist(session, update).catch(error => {
        if (persistFailureLogged.has(session)) return;
        persistFailureLogged.add(session);
        console.error("[collab] 协作会话持久化失败", { session: info.id }, error);
      });
      session.info.title = doc.getText("title").toString();
      manager.changed();
    };
    doc.on("update", onDocUpdate);
    session.detachDocListener = () => doc.off("update", onDocUpdate);
    manager.sessions.set(info.id, session);
    session.releaseResourceSource = registerContentResourceSource(info.id, {
      doc,
      localize: references =>
        tauri.collabResource<Record<string, string>>(
          manager.resourceContext(session),
          "localize",
          references
        ),
    });
    manager.attach(session);
    manager.changed();
    return session;
  } catch (failure) {
    doc.destroy();
    throw failure;
  }
}

/** 缓存可重建：备份后丢弃。返回 null 表示已无缓存。 */
export async function discardCache(
  _manager: CollaborationManager,
  info: SharedDocumentInfo,
  reason: string
): Promise<null> {
  await tauri.collabDiscardCache(info.id, reason);
  return null;
}

/** 服务端 state 采用 base64；弱网下允许有限重试，避免单个文档阻塞整个列表。 */
export async function loadState(manager: CollaborationManager, documentId: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= DOCUMENT_STATE_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await rest.getDocumentState(manager.serverUrl, documentId);
    } catch (failure) {
      if (!canRetryRead(failure)) throw failure;
      lastError = failure;
      if (attempt < DOCUMENT_STATE_MAX_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, 400 * attempt));
      }
    }
  }
  throw lastError;
}

export function revokeSession(
  manager: CollaborationManager,
  session: RuntimeSession,
  kind: "revoked" | "closed"
) {
  // 服务端 close 广播不排除发起者，本机主动结束共享时自己也会收到 closed；
  // 收尾与提示由 leave 流程负责，这里忽略以免和「已结束共享」重复提示
  if (session.info.leaving) return;
  const { id, title } = session.info;
  pushCollaborationNotice({ id: `${id}:${Date.now()}`, kind, documentId: id, title });
  manager.disposeSession(id);
  void manager.clearLocalBindings(id);
  manager.changed();
}

export function disposeSession(manager: CollaborationManager, documentId: string) {
  const session = manager.sessions.get(documentId);
  if (!session) return;
  if (session.provider) {
    session.provider.destroy();
    session.provider = null;
  }
  session.detachDocListener?.();
  session.releaseResourceSource?.();
  // 仅停止网络与广播：仍挂载的编辑器持有该 Y.Doc，销毁会导致随后输入报错；
  // 失去引用的 doc 由 GC 回收。
  session.awareness.setLocalState(null);
  manager.sessions.delete(documentId);
  if (useCollaborationStore.getState().sessions.some(item => item.id === documentId)) {
    manager.changed();
  }
}
