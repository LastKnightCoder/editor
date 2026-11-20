import * as Y from "yjs";
import { createHash, randomUUID } from "node:crypto";
import { Awareness, encodeAwarenessUpdate } from "y-protocols/awareness";
import { NODE_DOCUMENT_VERSION, NodeTree, type CollaborationSession } from "@tau/collaboration";
import {
  CONTENT_ENTITY_NODE_CONTRACTS,
  isContentEntityReference,
  type ContentEntityReference,
} from "@tau/db-schema/content-identities";
import databaseModule from "../database";
import ContentTable from "../tables/content";
import { bindingMatches } from "../collaboration/content-repository";
import {
  contentProjectionChanges,
  contentSession,
  registerContentSession,
  unregisterContentSession,
} from "../collaboration/content-sessions";
import { reportContentSaveIssue } from "../collaboration/persistence-diagnostics";
import type { RuntimeSession } from "../collaboration/types";
import { localContentHistoryId } from "../collaboration/session-identity";
import type { ContentSessionRuntime } from "./index";

export function findContent(
  runtime: ContentSessionRuntime,
  workspaceId: string,
  contentId: number
) {
  return [...runtime.sessions.values()].find(
    session =>
      session.info.source?.contentId === contentId &&
      session.info.source.databaseName.replace(/\.db$/, "") === workspaceId &&
      !session.doc.isDestroyed
  );
}

export function restore(runtime: ContentSessionRuntime, info: CollaborationSession, doc: Y.Doc) {
  if (doc.getMap("meta").get("version") !== NODE_DOCUMENT_VERSION)
    throw new Error("CONTENT_FORMAT_UNSUPPORTED: 正文格式不受支持");
  if (info.source && !Number.isSafeInteger(info.source.contentCreatedAt))
    info.source = runtime.findLocalSource(info.id, info.serverUrl);
  const session: RuntimeSession = {
    info: {
      ...info,
      // 旧版本因远端换代冻结的缓存不再冻结：联网刷新时按远端快照重建
      remoteVersionAvailable: false,
      frozen: Boolean(info.leaving || runtime.pendingShare(info.id)),
      connection: info.mode === "local" ? "connected" : "connecting",
    },
    doc,
    awareness: new Awareness(doc),
    assets: runtime.assets,
    store: runtime.store,
    dirty: true,
    projectionDirty: true,
    projectionVersion: { content: 0, contracts: 0 },
    projectionTree: new NodeTree(doc),
    projectionNodes: new Map(),
  };
  session.awareness.setLocalState(null);
  // 广播与落盘一律读 session.info.id：发起或结束共享会换 documentId，
  // 捕获创建时的 info.id 会让换身份之后的更新写错会话
  session.awareness.on(
    "update",
    ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
      runtime.broadcast("collaboration:awareness", {
        documentId: session.info.id,
        update: encodeAwarenessUpdate(session.awareness, [...added, ...updated, ...removed]),
      });
    }
  );
  runtime.sessions.set(info.id, session);
  session.replaceContent = (content, contracts, expectedRevision, checkScope, onAccepted) =>
    runtime.replaceContentSnapshot(
      session,
      content,
      contracts,
      expectedRevision,
      checkScope,
      onAccepted
    );
  session.persistNodeUpdate = (update, candidate) => {
    const store = runtime.store;
    store.db.transaction(() => {
      store.append(session.info.id, update);
      const historyId =
        session.info.mode === "local" ? localContentHistoryId(session.info.source) : undefined;
      if (!historyId) return;
      const before = Y.encodeStateAsUpdate(session.doc),
        after = Y.encodeStateAsUpdate(candidate);
      store.history.append(historyId, {
        operationId: randomUUID(),
        actor: { actorId: "local", actorName: "本机", source: "正文写入" },
        previousRevision: createHash("sha256").update(before).digest("hex"),
        revision: createHash("sha256").update(after).digest("hex"),
        update,
        before: () => before,
        after: () => after,
      });
    })();
  };
  session.retainNodeState = candidate => runtime.retainNodeState(session, candidate);
  runtime.retainNodeState(session, doc);
  doc.on(
    "update",
    (update: Uint8Array, origin: unknown, _doc: Y.Doc, transaction: Y.Transaction) => {
      session.dirty = true;
      session.projectionDirty = true;
      const version = session.projectionVersion;
      if (!version) throw new Error("正文投影代次未初始化");
      const changes = contentProjectionChanges(doc, transaction);
      const treeChanges = session.projectionTree?.transactionChanges(transaction);
      if (changes.content) {
        version.content++;
        if (!treeChanges || treeChanges.structural) session.projectionStructure = version.content;
        for (const id of treeChanges?.nodes ?? [])
          session.projectionNodes?.set(id, version.content);
      }
      if (changes.contracts) version.contracts++;
      const authoritative = runtime.contentUpdates().isApplyingAuthoritativeState(session, origin);
      if (origin !== "renderer-persisted" && !authoritative) {
        try {
          runtime.store.append(session.info.id, update);
        } catch (error) {
          session.cacheWriteFailed = true;
          session.info.error = `正文缓存尚未保存：${error instanceof Error ? error.message : String(error)}`;
          reportContentSaveIssue(session, "journal", error, { bytes: update.byteLength });
          throw error;
        }
      }
      try {
        runtime.retainNodeState(session, doc);
      } catch (failure) {
        session.info.error = failure instanceof Error ? failure.message : "实体持有记录尚未保存";
        runtime.changed(session);
      }
      if (session.info.mode !== "local" && origin !== session.provider && !authoritative)
        session.info.pending = true;
      const title = doc.getText("title").toString();
      if (session.info.title !== title) {
        session.info.title = title;
        runtime.changed(session);
      }
      runtime.store.metadata(session.info);
      runtime.broadcast("collaboration:update", { documentId: session.info.id, update });
      runtime.broadcast("collaboration:content", {
        documentId: session.info.id,
        source: session.info.source,
        title,
      });
      const source = session.info.source;
      const db = source && databaseModule.getDatabase(source.databaseName);
      const nodeTree = doc.share.get("node-tree:nodes");
      const nodeEvents = nodeTree && transaction.changedParentTypes.get(nodeTree);
      // 文字输入沿用已有任务身份，结构或 taskId 变化才需要重新核对。
      const needsTaskIds =
        treeChanges?.structural ||
        nodeEvents?.some(
          event =>
            event instanceof Y.YMapEvent &&
            (event.keysChanged.has("type") || event.keysChanged.has("taskId"))
        );
      if (changes.content && needsTaskIds && source && db?.open) {
        if (contentSession(db, source.contentId) === session)
          ContentTable.ensureTaskIds(db, source.contentId);
      }
      // 用户或别处的改动可能让待处理建议的锚点或原文前提失效，停顿后按当前正文核对
      if (changes.content && source)
        runtime.scheduleSuggestionValidation(
          source.databaseName.replace(/\.db$/, ""),
          source.contentId,
          () => (runtime.sessions.get(session.info.id) === session ? session.doc : undefined)
        );
    }
  );
  const source = session.info.source;
  const db = source && databaseModule.getDatabase(source.databaseName);
  const ownsBinding =
    db?.open &&
    source &&
    (session.info.mode === "local" || bindingMatches(db, source, info.id, info.serverUrl));
  if (ownsBinding) {
    registerContentSession(db, source.contentId, session);
    if (session.info.status === "active") ContentTable.ensureTaskIds(db, source.contentId);
  }
  // 会话恢复（重开正文、重启应用）时核对一次：关着期间正文可能经别处改过
  if (source && (!db?.open || ownsBinding))
    runtime.scheduleSuggestionValidation(
      source.databaseName.replace(/\.db$/, ""),
      source.contentId,
      () => (runtime.sessions.get(session.info.id) === session ? session.doc : undefined)
    );
  runtime.sharedEffects?.attach(session);
  return session;
}

export function retainNodeState(
  runtime: ContentSessionRuntime,
  session: RuntimeSession,
  doc: Y.Doc
) {
  if (doc.getMap("meta").get("version") !== NODE_DOCUMENT_VERSION) return;
  if (!runtime.contentState) throw new Error("本机持有服务尚未就绪");
  const tree = new NodeTree(doc);
  try {
    const references: ContentEntityReference[] = [];
    for (const id of tree.nodes.keys()) {
      const contract = tree.contract(id);
      const entity = contract && CONTENT_ENTITY_NODE_CONTRACTS[contract.type];
      if (!contract || !entity || contract.owner !== entity.owner) continue;
      const reference = tree.properties(id).get("entityRef");
      if (!isContentEntityReference(reference) || reference.kind !== entity.kind)
        throw new Error("实体引用缺少稳定来源身份");
      references.push(reference);
    }
    runtime.contentState.replaceHolds(
      session.info.source?.databaseName ?? "application",
      `document:${session.info.id}`,
      session.info.mode === "local" ? "undo" : "shared-membership",
      [
        ...runtime.contentState.holders(
          session.info.source?.databaseName ?? "application",
          `document:${session.info.id}`
        ),
        ...references,
      ]
    );
  } finally {
    tree.dispose();
  }
}

export function findSession(
  runtime: ContentSessionRuntime,
  id: string
): RuntimeSession | undefined {
  return runtime.sessions.get(id) ?? runtime.loadCached(id);
}

export function loadCached(
  runtime: ContentSessionRuntime,
  id: string,
  info?: CollaborationSession,
  check?: (info: CollaborationSession) => void
): RuntimeSession | undefined {
  if (!runtime.store.db.prepare("SELECT 1 FROM sessions WHERE id=?").get(id)) return undefined;
  let doc: Y.Doc | undefined;
  try {
    const cached = runtime.store.load(id);
    doc = cached.doc;
    check?.(cached.info);
    return runtime.restore(info ?? cached.info, doc);
  } catch (error) {
    const partial = runtime.sessions.get(id);
    if (partial && partial.doc === doc) {
      unregisterContentSession(partial);
      partial.awareness.destroy();
      runtime.sessions.delete(id);
    }
    doc?.destroy();
    const reason = error instanceof Error ? error.message : "协作缓存无法打开";
    console.warn(`[collaboration] 会话 ${id} 缓存无法打开，已备份并丢弃后重建`, error);
    runtime.store.discard(id, reason);
    runtime.contentState?.db
      .prepare("DELETE FROM entity_holds WHERE holder=?")
      .run(`document:${id}`);
    return undefined;
  }
}
