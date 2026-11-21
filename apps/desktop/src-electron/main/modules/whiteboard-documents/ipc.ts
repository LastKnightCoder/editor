import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import { randomUUID } from "node:crypto";
import * as Y from "yjs";
import {
  normalizeServerUrl,
  WhiteboardModel,
  readWhiteboardPresence,
  exportWhiteboardTransfer,
  type DocumentSyncSession,
} from "@tau/collaboration";
import ContentTable from "../tables/content";
import {
  isContentEntityReference,
  CONTENT_ENTITY_KINDS,
  type ContentEntityKind,
} from "@tau/db-schema/content-identities";
import collaborationModule from "../collaboration";
import { isVideoFile } from "../collaboration/asset-service";
import databaseModule from "../database";
import { ContentIdentityTable } from "../tables/content-identity";
import { CollaborationLocalStore } from "../collaboration/local-store";
import { stateHash } from "./journal";
import { WhiteboardDocumentRepository } from "./repository";
import { WhiteboardRealtime } from "./realtime";
import type {
  WhiteboardRemoteStatus,
  WhiteboardShareCandidate,
  WhiteboardShareStatus,
} from "@/types/whiteboard-document";
import type { AgentBoardRequest, BoardAgentActivity } from "../../../../shared/whiteboard-agent";
import type { WhiteboardUnshareJob, WhiteboardUnshareMode } from "./unshare";
import type { WhiteboardDocumentsModule } from "./index";

type RemoteSnapshot = ReturnType<DocumentSyncSession["snapshot"]>;
const ROOM_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
/** IPC 只保留错误文本，按服务端代码加前缀，渲染端据此区分断网、权限与版本。 */
function remoteFailure(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (/^[A-Z][A-Z_]+: /.test(message)) throw error;
  const failure = error as { code?: unknown; status?: unknown; name?: unknown };
  const code =
    typeof failure.code === "string" && failure.code !== "REQUEST_FAILED"
      ? failure.code
      : typeof failure.status === "number"
        ? failure.status >= 500
          ? "OFFLINE"
          : "REMOTE_FAILED"
        : ["TypeError", "TimeoutError", "AbortError"].includes(String(failure.name))
          ? "OFFLINE"
          : "REMOTE_FAILED";
  throw new Error(`${code}: ${message}`);
}
const sameBaseline = (
  left: RemoteSnapshot["confirmed"]["protocol"],
  right: RemoteSnapshot["confirmed"]["protocol"]
) => left.id === right.id && left.epoch === right.epoch && left.baselineId === right.baselineId;
/**
 * 只有同一确认基线上的被拒分支可能已混入本机副本；换代前保全的旧分支不污染新副本，
 * 已用确认快照重建本机副本之前的分支（前 clean 条）也不再污染。
 */
const taintedBy = (snapshot: RemoteSnapshot, clean = 0) =>
  snapshot.rejected
    .slice(clean)
    .some(branch => sameBaseline(branch.baseline.protocol, snapshot.confirmed.protocol));
const remoteStatus = (
  snapshot: RemoteSnapshot,
  status: Omit<WhiteboardRemoteStatus, "pending">
): WhiteboardRemoteStatus => ({ ...status, pending: snapshot.pending.length });

export function registerWhiteboardDocumentIpc(
  module: WhiteboardDocumentsModule,
  store: CollaborationLocalStore,
  projected: (databaseName: string, documentId: string) => void
): void {
  const handle = (name: string, fn: (event: IpcMainInvokeEvent, ...args: any[]) => unknown) =>
    ipcMain.handle(`whiteboard-document:${name}`, fn);
  const transitionContext = async (
    event: IpcMainInvokeEvent,
    leaseId: string,
    operationId: string
  ) => {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(operationId)) throw new Error("共享操作身份无效");
    const owner = module.leaseOwner(event, leaseId);
    const source = module.sessions.snapshot(leaseId, owner);
    const scope = JSON.stringify([source.identity.databaseName, source.identity.documentId]);
    if (module.transitionOwners.has(scope) && module.transitionOwners.get(scope) !== operationId)
      throw new Error("白板已有正在处理的共享操作");
    module.transitionOwners.set(scope, operationId);
    if (!module.transitionDrains.has(operationId)) {
      let preparing = module.transitionPreparing.get(operationId);
      if (!preparing) {
        preparing = module
          .drain({
            databaseName: source.identity.databaseName,
            documentId: source.identity.documentId,
            reason: "database-change",
          })
          .then(drain => {
            module.transitionDrains.set(operationId, drain);
          });
        module.transitionPreparing.set(operationId, preparing);
      }
      try {
        await preparing;
      } catch (error) {
        module.transitionOwners.delete(scope);
        throw error;
      } finally {
        module.transitionPreparing.delete(operationId);
      }
    }
    const current = module.sessions.snapshot(leaseId, owner);
    const db = databaseModule.getDatabase(current.identity.databaseName);
    if (!db) throw new Error("白板视图数据库未连接");
    return {
      source: current,
      db,
      name: current.identity.databaseName,
      documentId: current.identity.documentId,
    };
  };
  handle(
    "publish",
    async (
      event,
      leaseId: string,
      request: { operationId: string; serverUrl: string; pageIds: string[] }
    ) => {
      // 已绑定时直接拒绝，不为一次必然失败的请求冻结所有视图。
      const identity = module.sessions.snapshot(
          leaseId,
          module.leaseOwner(event, leaseId)
        ).identity,
        bindingKey = `whiteboard-binding:${identity.databaseName}:${identity.documentId}`;
      const db = databaseModule.getDatabase(identity.databaseName);
      if (
        store.get(bindingKey, null) ||
        (db && module.hasSharedBaseline(db, identity.databaseName, identity.documentId))
      )
        throw new Error("此白板已绑定共享，不能再次创建并行房间");
      const source = module.sessions.snapshot(leaseId, module.leaseOwner(event, leaseId));
      await module.transitions.preflight(source.state, identity.documentId, request.pageIds);
      const context = await transitionContext(event, leaseId, request.operationId);
      try {
        const result = await module.transitions.publish(
          context.db,
          context.name,
          context.documentId,
          request
        );
        module.transitionDrains.get(request.operationId)?.commit();
        module.clearTransition(request.operationId);
        projected(context.name, context.documentId);
        void collaborationModule.refreshShared?.().catch(() => undefined);
        return result;
      } catch (error) {
        if (!module.blocked(context.name, context.documentId)) {
          module.transitionDrains.get(request.operationId)?.rollback();
          module.clearTransition(request.operationId);
        }
        remoteFailure(error);
      }
    }
  );
  handle("publish-resume", async (event, databaseName: string, operationId: string) => {
    module.owner(event, databaseName);
    const db = databaseModule.getDatabase(databaseName);
    if (!db) throw new Error("原资料库未连接");
    const documentId = module.transitions.publicationDocument(databaseName, operationId);
    const result = await module.transitions
      .resumePublication(db, databaseName, operationId)
      .catch(remoteFailure);
    module.transitionDrains.get(operationId)?.commit();
    module.clearTransition(operationId);
    if (documentId) projected(databaseName, documentId);
    void collaborationModule.refreshShared?.().catch(() => undefined);
    return result;
  });
  handle("publish-cancel", async (event, databaseName: string, operationId: string) => {
    module.owner(event, databaseName);
    const documentId = module.transitions.publicationDocument(databaseName, operationId);
    await module.transitions.cancelPublication(databaseName, operationId).catch(remoteFailure);
    module.transitionDrains.get(operationId)?.rollback();
    module.clearTransition(operationId);
    if (documentId) projected(databaseName, documentId);
  });
  handle(
    "share-status",
    (event, databaseName: string, documentId: string): WhiteboardShareStatus => {
      module.owner(event, databaseName);
      const bindingKey = `whiteboard-binding:${databaseName}:${documentId}`,
        unshareKey = `whiteboard-unshare:${databaseName}:${documentId}`;
      // 本机替换已装完、只差清除绑定时补完收尾，避免本机文档再去连接已关闭的房间。
      const unshareJob = store.get<WhiteboardUnshareJob | null>(unshareKey, null);
      if (unshareJob?.remoteDone) {
        const db = databaseModule.getDatabase(databaseName),
          stored = db && new WhiteboardDocumentRepository(db, databaseName).read(documentId);
        if (stored && !module.installation.pending(databaseName, documentId)) {
          const doc = new Y.Doc();
          Y.applyUpdate(doc, stored.state);
          if (!doc.share.has("meta") || doc.getMap("meta").get("version") !== 3) {
            store.db.transaction(() => {
              store.delete(bindingKey);
              store.delete(unshareKey);
            })();
            module.transitionDrains.get(unshareJob.operationId)?.commit();
            module.clearTransition(unshareJob.operationId);
          }
          doc.destroy();
        }
      }
      const publication = module.transitions.pendingPublication(databaseName, documentId);
      const unshare = module.pendingUnshare(databaseName, documentId);
      return {
        ...(unshare ? { unshare: { operationId: unshare.operationId, mode: unshare.mode } } : {}),
        binding: store.get<WhiteboardShareStatus["binding"]>(bindingKey, null),
        publication,
      };
    }
  );
  handle(
    "remote-install",
    async (event, databaseName: string, serverUrl: string, roomId: string) => {
      const windowId = module.owner(event, databaseName);
      module.assertOpenAllowed(windowId, databaseName);
      if (typeof roomId !== "string" || !ROOM_ID.test(roomId)) throw new Error("共享白板身份无效");
      const db = databaseModule.getDatabase(databaseName);
      if (!db) throw new Error("资料库未连接");
      const url = normalizeServerUrl(serverUrl);
      const pages = (documentId: string) => {
        const stored = new WhiteboardDocumentRepository(db, databaseName).read(documentId);
        if (!stored) return null;
        return {
          documentId,
          boardId: stored.boardId,
          contentIds: (
            db
              .prepare(
                "SELECT content_id FROM whiteboard_document_pages WHERE document_id=? AND visible=1 ORDER BY page_index"
              )
              .all(documentId) as { content_id: number }[]
          ).map(row => row.content_id),
        };
      };
      const prefix = `whiteboard-binding:${databaseName}:`;
      for (const row of store.db
        .prepare("SELECT key,value FROM settings WHERE key LIKE 'whiteboard-binding:%'")
        .all() as { key: string; value: string }[]) {
        if (!row.key.startsWith(prefix)) continue;
        const binding = JSON.parse(row.value) as { serverUrl: string; documentId: string };
        if (binding.documentId !== roomId || binding.serverUrl !== url) continue;
        const existing = pages(row.key.slice(prefix.length));
        if (existing) return existing;
      }
      // 先固定本机文档身份，重试时沿用同一身份，避免在本库重复落一份副本。
      const installKey = `whiteboard-install:${databaseName}:${url}:${roomId}`;
      const install = store.get<{ documentId: string } | null>(installKey, null) ?? {
        documentId: randomUUID(),
      };
      store.set(installKey, install);
      if (!pages(install.documentId)) {
        const { session, release } = await module.remoteSession(url, roomId).catch(remoteFailure);
        try {
          await session.synchronize().catch(remoteFailure);
          const confirmed = session.snapshot().confirmed;
          if (confirmed.protocol.id !== roomId) throw new Error("共享白板身份与远端确认不一致");
          module.owner(event, databaseName);
          await module.prepareView(
            windowId,
            databaseName,
            install.documentId,
            module.sessions.create(databaseName, install.documentId, confirmed.state, "board")
          );
        } finally {
          release();
        }
      }
      store.set(`${prefix}${install.documentId}`, {
        serverUrl: url,
        documentId: roomId,
      });
      store.delete(installKey);
      projected(databaseName, install.documentId);
      const installedPages = pages(install.documentId);
      if (!installedPages) throw new Error(`白板页读取失败：${install.documentId}`);
      return installedPages;
    }
  );
  handle(
    "unshare",
    async (
      event,
      leaseId: string,
      request: { operationId: string; mode: WhiteboardUnshareMode }
    ) => {
      if (!["close", "leave", "detach"].includes(request?.mode))
        throw new Error("结束共享方式无效");
      const identity = module.sessions.snapshot(
        leaseId,
        module.leaseOwner(event, leaseId)
      ).identity;
      const pending = module.pendingUnshare(identity.databaseName, identity.documentId);
      if (pending) request = { operationId: pending.operationId, mode: pending.mode };
      const context = await transitionContext(event, leaseId, request.operationId);
      try {
        const result = await module.unshareQueue.run(
          JSON.stringify([context.name, context.documentId]),
          0,
          () => module.unshare(context, request)
        );
        module.transitionDrains.get(request.operationId)?.commit();
        module.clearTransition(request.operationId);
        projected(context.name, context.documentId);
        void collaborationModule.refreshShared?.().catch(() => undefined);
        return result;
      } catch (error) {
        if (!module.blocked(context.name, context.documentId)) {
          module.transitionDrains.get(request.operationId)?.rollback();
          module.clearTransition(request.operationId);
        }
        remoteFailure(error);
      }
    }
  );
  handle("unshare-resume", async (event, databaseName: string, documentId: string) => {
    module.owner(event, databaseName);
    const db = databaseModule.getDatabase(databaseName);
    if (!db) throw new Error("原资料库未连接");
    const page = db
      .prepare("SELECT content_id FROM whiteboard_document_pages WHERE document_id=? LIMIT 1")
      .get(documentId) as { content_id: number } | undefined;
    if (!page) throw new Error("白板文档不存在");
    await module.finishPendingUnshare(databaseName, page.content_id);
    projected(databaseName, documentId);
    void collaborationModule.refreshShared?.().catch(() => undefined);
  });
  const resourceContext = (event: IpcMainInvokeEvent, leaseId: string) => {
    const owner = module.leaseOwner(event, leaseId),
      local = module.sessions.snapshot(leaseId, owner);
    module.assertOpenAllowed(owner, local.identity.databaseName, local.identity.documentId);
    const key = module.remoteViews.get(leaseId)?.key;
    const binding = store.get<{ serverUrl: string; documentId: string } | null>(
      `whiteboard-binding:${local.identity.databaseName}:${local.identity.documentId}`,
      null
    );
    const [url, , remoteId] = key
      ? (JSON.parse(key) as string[])
      : [binding?.serverUrl, undefined, binding?.documentId];
    return { owner, documentId: remoteId ?? local.identity.documentId, url: url ?? "", key };
  };
  const resourceAccess = async (key?: string) => {
    if (!key) return;
    const session = await module.remote.get(key);
    if (!session || session.snapshot().blocked)
      throw new Error("文档权限或同步状态不可用，不能读取或上传资源");
  };
  handle("copy-content", async (event, leaseId: string, elementId: string) => {
    const context = resourceContext(event, leaseId);
    await resourceAccess(context.key);
    const local = module.sessions.snapshot(leaseId, context.owner),
      doc = new Y.Doc();
    Y.applyUpdate(doc, local.state);
    const model = new WhiteboardModel(doc);
    try {
      const bundle = exportWhiteboardTransfer(model, context.documentId, [elementId]);
      const node = bundle.pages.flatMap(page => page.elements).find(node => node.id === elementId);
      if (!node || !Array.isArray(node.body)) throw new Error("板内正文不存在");
      const contracts = Object.fromEntries(
        Object.entries(bundle.contracts).filter(([, contract]) => contract.domain === "editor-node")
      );
      const assets = module.assets;
      for (const reference of bundle.resources.filter(ref => ref.startsWith("tau-collab-")))
        await assets.readTransferFile(context.url, context.documentId, reference);
      const value = await assets.localizeDocument(
        context.url,
        context.documentId,
        { title: "", bannerBg: "", bannerPosition: "center", content: [...node.body] },
        contracts
      );
      resourceContext(event, leaseId);
      await resourceAccess(context.key);
      const db = databaseModule.getDatabase(local.identity.databaseName);
      if (!db) throw new Error("原资料库已关闭");
      return ContentTable.createPendingContent(db, {
        content: value.content as unknown as import("slate").Descendant[],
        contracts,
      });
    } finally {
      model.dispose();
      doc.destroy();
    }
  });
  handle("resource-read", async (event, leaseId: string, reference: string) => {
    const context = resourceContext(event, leaseId);
    await resourceAccess(context.key);
    const file = await module.assets.readTransferFile(context.url, context.documentId, reference);
    resourceContext(event, leaseId);
    await resourceAccess(context.key);
    return file;
  });
  handle(
    "resource-import",
    async (event, leaseId: string, sourceDocumentId: string, reference: string) => {
      const target = resourceContext(event, leaseId);
      const source = module.sessions
        .holders({ owner: target.owner })
        .find(
          view =>
            module.sessions.snapshot(view.leaseId, target.owner).identity.documentId ===
            sourceDocumentId
        );
      if (!source) throw new Error("请先打开有权访问的源白板，资源尚未导入");
      const origin = resourceContext(event, source.leaseId);
      await resourceAccess(origin.key);
      await resourceAccess(target.key);
      const assets = module.assets;
      const file = await assets.readTransferFile(origin.url, origin.documentId, reference);
      resourceContext(event, source.leaseId);
      resourceContext(event, leaseId);
      await resourceAccess(origin.key);
      await resourceAccess(target.key);
      const copied =
        !target.url || isVideoFile(file)
          ? await assets.keepLocalFile(target.documentId, file)
          : await assets.enqueue(target.documentId, file);
      if (target.url && !isVideoFile(file)) await assets.flush(target.url, target.documentId);
      resourceContext(event, leaseId);
      await resourceAccess(target.key);
      return copied;
    }
  );
  handle(
    "resource-upload",
    async (event, leaseId: string, payload: { name: string; mime: string; bytes: Uint8Array }) => {
      const context = resourceContext(event, leaseId);
      if (
        !payload ||
        typeof payload.name !== "string" ||
        typeof payload.mime !== "string" ||
        !(payload.bytes instanceof Uint8Array) ||
        payload.bytes.byteLength > 25 * 1024 * 1024
      )
        throw new Error("资源超过预算或格式无效");
      await resourceAccess(context.key);
      const assets = module.assets;
      const reference =
        !context.url || isVideoFile(payload)
          ? await assets.keepLocalFile(context.documentId, payload)
          : await assets.enqueue(context.documentId, payload);
      if (context.url && !isVideoFile(payload)) await assets.flush(context.url, context.documentId);
      const current = resourceContext(event, leaseId);
      if (current.key !== context.key || current.documentId !== context.documentId)
        throw new Error("资源所属会话已变化，已保留上传结果");
      return reference;
    }
  );
  handle("resource-resolve", async (event, leaseId: string, reference: string) => {
    const context = resourceContext(event, leaseId);
    if (!/^tau-collab-(asset|local):[a-f0-9-]{36}$/.test(reference))
      throw new Error("只允许解析此文档的资源标识");
    await resourceAccess(context.key);
    const value = await module.assets.resolveReference(context.url, context.documentId, reference);
    const current = resourceContext(event, leaseId);
    if (current.key !== context.key || current.documentId !== context.documentId)
      throw new Error("资源所属会话已变化");
    return value;
  });
  handle("reference-entity", (event, databaseName: string, kind: ContentEntityKind, id: number) => {
    module.owner(event, databaseName);
    module.assertOpenAllowed(module.owner(event), databaseName);
    if (!CONTENT_ENTITY_KINDS.includes(kind)) throw new Error("实体种类无效");
    const db = databaseModule.getDatabase(databaseName);
    if (!db) throw new Error("资料库未连接");
    return ContentIdentityTable.reference(db, kind, id);
  });
  handle("resolve-entity", (event, databaseName: string, reference: unknown) => {
    module.owner(event, databaseName);
    if (!isContentEntityReference(reference)) throw new Error("实体引用无效");
    const db = databaseModule.getDatabase(databaseName);
    if (!db) throw new Error("资料库未连接");
    return ContentIdentityTable.resolve(db, reference);
  });
  handle("locate", (event, databaseName: string, contentId: number) => {
    module.owner(event, databaseName);
    const db = databaseModule.getDatabase(databaseName);
    if (!db) throw new Error("资料库未连接");
    const found = new WhiteboardDocumentRepository(db, databaseName).byPage(contentId);
    return found ? { documentId: found.document.documentId, pageId: found.pageId } : null;
  });
  handle(
    "share-candidates",
    (event, databaseName: string, keyword: string): WhiteboardShareCandidate[] => {
      module.owner(event, databaseName);
      const db = databaseModule.getDatabase(databaseName);
      if (!db) throw new Error("资料库未连接");
      const prefix = `whiteboard-binding:${databaseName}:`;
      const shared = (
        store.db
          .prepare("SELECT key FROM settings WHERE key LIKE 'whiteboard-binding:%'")
          .all() as { key: string }[]
      )
        .filter(row => row.key.startsWith(prefix))
        .map(row => row.key.slice(prefix.length));
      // 未完成的首次发布只能在白板页续做或取消，不作为新候选。
      return new WhiteboardDocumentRepository(db, databaseName)
        .shareCandidates(keyword.trim(), shared, 30)
        .filter(row => !module.transitions.pendingPublication(databaseName, row.documentId));
    }
  );
  handle("resolve-page", (event, databaseName: string, documentId: string, pageId: string) => {
    module.owner(event, databaseName);
    const db = databaseModule.getDatabase(databaseName);
    if (!db) throw new Error("资料库未连接");
    if (!new WhiteboardDocumentRepository(db, databaseName).read(documentId))
      throw new Error("白板文档不存在");
    const row = db
      .prepare(
        "SELECT content_id FROM whiteboard_document_pages WHERE document_id=? AND page_id=? AND visible=1"
      )
      .get(documentId, pageId) as { content_id: number } | undefined;
    if (!row) throw new Error("白板页面尚未完成投影");
    return row.content_id;
  });
  handle(
    "create",
    async (
      event,
      databaseName: string,
      requestId: string,
      state: Uint8Array,
      owner: "board" | "standalone"
    ) => {
      const windowId = module.owner(event, databaseName);
      module.assertOpenAllowed(windowId, databaseName);
      const created = await module.prepareView(
        windowId,
        databaseName,
        requestId,
        module.sessions.create(databaseName, requestId, state, owner)
      );
      projected(databaseName, created.documentId);
      return created;
    }
  );
  handle("open", async (event, databaseName: string, contentId: number, viewId: string) => {
    const owner = module.owner(event, databaseName);
    if (
      [...module.drains].some(
        scope =>
          !scope.documentId &&
          (scope.windowId === undefined || scope.windowId === owner) &&
          (!scope.databaseName || scope.databaseName === databaseName)
      )
    )
      throw new Error("白板正在关闭或切库，请稍后重试");
    await module.finishPendingUnshare(databaseName, contentId);
    module.owner(event, databaseName);
    const db = databaseModule.getDatabase(databaseName);
    const documentId =
      db &&
      new WhiteboardDocumentRepository(db, databaseName).byPage(contentId)?.document.documentId;
    module.assertOpenAllowed(owner, databaseName, documentId);
    const result = await module.prepareView(
      owner,
      databaseName,
      documentId ?? "",
      module.sessions.open(databaseName, contentId, owner, viewId)
    );
    try {
      module.owner(event, databaseName);
    } catch (error) {
      module.sessions.abandon(owner);
      throw error;
    }
    return result;
  });
  const publishSaved = (leaseId: string) => {
    try {
      module.realtime.get(leaseId)?.publishDocument();
    } catch (error) {
      console.warn("[whiteboard-sync] 实时发送失败，保留耐久更新等待补偿", {
        leaseId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
  const presenceScope = (event: IpcMainInvokeEvent, leaseId: string) => {
    const owner = module.leaseOwner(event, leaseId);
    const view = module.sessions.holders({ owner }).find(v => v.leaseId === leaseId);
    if (!view) throw new Error("白板视图已释放");
    return view.scope;
  };
  handle("agent-peers", (event, leaseId: string) =>
    module.agents.snapshot(presenceScope(event, leaseId))
  );
  handle("agent-activity", (event, leaseId: string, activity: BoardAgentActivity | null) => {
    const scope = presenceScope(event, leaseId);
    if (activity) module.agents.set(scope, leaseId, activity);
    else module.agents.release(leaseId);
  });
  const agentCalls = new Map<string, AbortController>();
  handle("agent-cancel", (event, executionId: string) => {
    agentCalls.get(JSON.stringify([event.sender.id, executionId]))?.abort();
  });
  handle(
    "agent-apply",
    async (event, leaseId: string, executionId: string, request: AgentBoardRequest) => {
      const owner = module.leaseOwner(event, leaseId);
      const key = JSON.stringify([event.sender.id, executionId]);
      if (agentCalls.has(key)) throw new Error("白板调用正在进行");
      const controller = new AbortController();
      agentCalls.set(key, controller);
      try {
        const receipt = await module.sessions.applyAgent(
          leaseId,
          owner,
          request,
          controller.signal
        );
        if (!receipt.error) publishSaved(leaseId);
        return receipt;
      } finally {
        agentCalls.delete(key);
      }
    }
  );
  handle("append", async (event, leaseId: string, batchId: string, update: Uint8Array) => {
    const receipt = await module.sessions.append(
      leaseId,
      module.leaseOwner(event, leaseId),
      batchId,
      update
    );
    if (!receipt.error) publishSaved(leaseId);
    return receipt;
  });
  handle("snapshot", (event, leaseId: string) =>
    module.sessions.snapshot(leaseId, module.leaseOwner(event, leaseId))
  );
  handle("flush", (event, leaseId: string) =>
    module.sessions.flush(leaseId, module.leaseOwner(event, leaseId))
  );
  handle("release", (event, leaseId: string) => {
    const owner = module.leaseOwner(event, leaseId);
    return module.sessions.release(leaseId, owner).then(() => {
      module.releaseRemoteView(leaseId);
    });
  });
  handle("remote-open", async (event, leaseId: string, serverUrl: string) => {
    const owner = module.leaseOwner(event, leaseId),
      local = module.sessions.snapshot(leaseId, owner);
    module.assertOpenAllowed(owner, local.identity.databaseName, local.identity.documentId);
    return module.prepareView(
      owner,
      local.identity.databaseName,
      local.identity.documentId,
      (async () => {
        const doc = new Y.Doc();
        try {
          Y.applyUpdate(doc, local.state);
          const meta = doc.getMap("meta"),
            documentId = meta.get("documentId");
          if (meta.get("version") !== 3 || typeof documentId !== "string")
            throw new Error("白板尚未绑定共享基线；首次发布须经独立发布流程");
          const {
            key,
            session: remote,
            release,
          } = await module.remoteSession(serverUrl, documentId).catch(remoteFailure);
          try {
            module.leaseOwner(event, leaseId);
            const onBaseline = (value: RemoteSnapshot) =>
              meta.get("epoch") === value.confirmed.protocol.epoch &&
              meta.get("baselineId") === value.confirmed.protocol.baselineId;
            let snapshot = remote.snapshot();
            // 本机已装新代次（作者升级或采用新版本）而网络会话仍停在旧确认时，先取回最新确认再比较。
            if (!onBaseline(snapshot)) {
              await remote.synchronize().catch(remoteFailure);
              snapshot = remote.snapshot();
            }
            const clean = stateHash(local.state) === snapshot.confirmed.protocol.revision;
            // 本机副本位于当前确认基线且未混入同基线的被拒分支（或恰为确认快照）时，解除隔离继续发送。
            if (
              snapshot.blocked &&
              onBaseline(snapshot) &&
              (clean || !taintedBy(snapshot, module.cleanRejected(key)))
            ) {
              await remote.restartFromConfirmed().catch(remoteFailure);
              snapshot = remote.snapshot();
            }
            if (!onBaseline(snapshot))
              return remoteStatus(snapshot, { requiresRebind: true, reason: "epoch" });
            if (
              (snapshot.blocked || taintedBy(snapshot, module.cleanRejected(key))) &&
              stateHash(local.state) !== snapshot.confirmed.protocol.revision
            )
              return remoteStatus(snapshot, { requiresRebind: true, reason: "rejected" });
            module.remoteViews.set(leaseId, { key, rejectedCount: snapshot.rejected.length });
            if (!module.realtime.has(leaseId)) {
              const protocol = snapshot.confirmed.protocol;
              const realtime = new WhiteboardRealtime(
                await module.remoteClient(),
                normalizeServerUrl(serverUrl),
                snapshot.confirmed.protocol,
                async state => {
                  if (module.realtime.get(leaseId) !== realtime || remote.snapshot().blocked)
                    return;
                  module.leaseOwner(event, leaseId);
                  const current = new Y.Doc();
                  const incoming = new Y.Doc();
                  try {
                    Y.applyUpdate(current, module.sessions.snapshot(leaseId, owner).state);
                    Y.applyUpdate(incoming, state);
                    const incomingMeta = incoming.getMap("meta");
                    if (
                      incomingMeta.get("baselineId") !== protocol.baselineId ||
                      incomingMeta.get("epoch") !== protocol.epoch
                    )
                      throw new Error("推送基线与本机会话不一致");
                    const before = stateHash(Y.encodeStateAsUpdate(current));
                    const update = Y.encodeStateAsUpdate(incoming, Y.encodeStateVector(current));
                    Y.applyUpdate(current, update);
                    if (stateHash(Y.encodeStateAsUpdate(current)) !== before)
                      await module.sessions.append(
                        leaseId,
                        owner,
                        `push:${stateHash(update)}`,
                        update
                      );
                  } finally {
                    current.destroy();
                    incoming.destroy();
                  }
                },
                value => {
                  const window = BrowserWindow.fromId(owner);
                  if (window && !window.isDestroyed() && !window.webContents.isDestroyed())
                    window.webContents.send("whiteboard-document:realtime", {
                      leaseId,
                      ...value,
                    });
                },
                () => {
                  const current = remote.snapshot();
                  if (
                    module.realtime.get(leaseId) !== realtime ||
                    current.blocked ||
                    current.rejected.length !== snapshot.rejected.length
                  )
                    return;
                  module.leaseOwner(event, leaseId);
                  return module.sessions.snapshot(leaseId, owner).state;
                }
              );
              module.realtime.set(leaseId, realtime);
            }
            return remoteStatus(snapshot, { requiresRebind: false });
          } finally {
            release();
          }
        } finally {
          doc.destroy();
        }
      })()
    );
  });
  handle("presence", (event, leaseId: string, value: unknown) => {
    module.leaseOwner(event, leaseId);
    const presence = readWhiteboardPresence(value);
    if (value !== null && !presence) throw new Error("白板在线状态无效");
    module.realtime.get(leaseId)?.presence(presence);
  });
  handle("remote-sync", async (event, leaseId: string) => {
    const owner = module.leaseOwner(event, leaseId),
      binding = module.remoteViews.get(leaseId),
      pending = binding && module.remote.get(binding.key);
    if (!binding || !pending) throw new Error("白板远端会话未打开");
    return module.serialRemote(binding.key, async () => {
      const session = await pending;
      const failure = (error: unknown): never => {
        if (session.snapshot().blocked) module.stopRealtime(binding.key);
        return remoteFailure(error);
      };
      const rebind = (snapshot: RemoteSnapshot, meta: { get(key: string): unknown }) => {
        module.stopRealtime(binding.key);
        return remoteStatus(snapshot, {
          requiresRebind: true,
          reason:
            meta.get("epoch") !== snapshot.confirmed.protocol.epoch ||
            meta.get("baselineId") !== snapshot.confirmed.protocol.baselineId
              ? "epoch"
              : "rejected",
        });
      };
      const metaOf = (state: Uint8Array) => {
        const doc = new Y.Doc();
        try {
          Y.applyUpdate(doc, state);
          return new Map<string, unknown>(doc.getMap("meta").entries());
        } finally {
          doc.destroy();
        }
      };
      if (!session.snapshot().blocked) await session.flush().catch(failure);
      if (!session.snapshot().blocked) await session.synchronize().catch(failure);
      let snapshot = session.snapshot();
      const local = module.sessions.snapshot(leaseId, owner),
        doc = new Y.Doc();
      try {
        Y.applyUpdate(doc, local.state);
        const meta = doc.getMap("meta"),
          protocol = snapshot.confirmed.protocol;
        if (
          snapshot.blocked ||
          snapshot.rejected.length !== binding.rejectedCount ||
          meta.get("documentId") !== protocol.id ||
          meta.get("baselineId") !== protocol.baselineId ||
          meta.get("epoch") !== protocol.epoch
        )
          return rebind(snapshot, meta);
        await module.pushLocal(session, local.state).catch(failure);
        snapshot = session.snapshot();
        if (
          snapshot.blocked ||
          snapshot.confirmed.protocol.epoch !== protocol.epoch ||
          snapshot.confirmed.protocol.baselineId !== protocol.baselineId
        )
          return rebind(snapshot, metaOf(local.state));
        const requiresSync = module.sessions.snapshot(leaseId, owner).revision !== local.revision;
        const next = snapshot.confirmed.protocol;
        // 只把本机尚缺的远端内容作为一个批次写入本机日志；无新内容时不推进本机修订。
        const current = new Y.Doc();
        try {
          Y.applyUpdate(current, module.sessions.snapshot(leaseId, owner).state);
          const before = stateHash(Y.encodeStateAsUpdate(current)),
            localVector = Y.encodeStateVector(current);
          Y.applyUpdate(current, snapshot.confirmed.state);
          if (stateHash(Y.encodeStateAsUpdate(current)) !== before) {
            const missing = new Y.Doc();
            try {
              Y.applyUpdate(missing, snapshot.confirmed.state);
              await module.sessions.append(
                leaseId,
                owner,
                `remote:${next.sequence}:${next.revision}`,
                Y.encodeStateAsUpdate(missing, localVector)
              );
            } finally {
              missing.destroy();
            }
          }
        } finally {
          current.destroy();
        }
        return remoteStatus(snapshot, {
          requiresRebind: false,
          requiresSync,
          localRevision: module.sessions.snapshot(leaseId, owner).revision,
        });
      } finally {
        doc.destroy();
      }
    });
  });
  handle("drained", (event, requestId: string, error?: string) => {
    const owner = module.owner(event),
      waiter = module.waiters.get(requestId);
    if (waiter?.owner === owner) waiter.resolve(error);
  });
}
