import { basename } from "node:path";
import { NODE_DOCUMENT_VERSION, readNodeDocument, type ContentNode } from "@tau/collaboration";
import type { ContentContractDictionary } from "@tau/db-schema/content-contracts";
import databaseModule from "../database";
import { findCollaborationBinding } from "../collaboration-guard";
import { projectContentTitle } from "../collaboration/content-sessions";
import {
  reportContentSaveComplete,
  reportContentSaveIssue,
} from "../collaboration/persistence-diagnostics";
import { emitContentWritten } from "../content-events";
import { desktopContentMetrics } from "../../../../shared/content-metrics";
import { getContentLength } from "@/utils/helper";
import type { RuntimeSession } from "../collaboration/types";
import type { ContentSessionRuntime } from "./index";

export interface ContentProjectionHead {
  documentId: string;
  revision: string;
  formatVersion: number | null;
}

export type ContentProjectionWrite = {
  documentId: string;
  contracts: ContentContractDictionary;
} & (
  | {
      kind: "blocks";
      expectedRevision: string;
      blocks: ContentNode[];
      order?: readonly string[];
      count: (content: ContentNode[]) => number;
      countRules: string;
    }
  | {
      kind: "snapshot";
      expectedRevision: string | undefined;
      content: ContentNode[];
      count: number;
      changes?: { content: boolean; contracts: boolean };
    }
);

export interface ContentProjectionStore {
  readHead(): ContentProjectionHead;
  commit(write: ContentProjectionWrite): { changed: boolean; writtenBlocks: number };
}

export function project(runtime: ContentSessionRuntime, session: RuntimeSession): Promise<void> {
  if (session.doc.getMap("meta").get("version") !== NODE_DOCUMENT_VERSION) return Promise.resolve();
  const pending = runtime.projecting.get(session);
  if (pending) return pending;
  const task = runtime.projectSession(session).finally(() => {
    runtime.projecting.delete(session);
  });
  runtime.projecting.set(session, task);
  return task;
}

export async function projectSession(runtime: ContentSessionRuntime, session: RuntimeSession) {
  const started = performance.now();
  let stage = "checkpoint",
    path = "idle",
    selectedBlocks = 0,
    writtenBlocks = 0;
  let committed = false;
  let storageBefore: number | null | undefined;
  let expectedRevision: string | undefined, actualRevision: string | undefined;
  try {
    // 异步补存期间收到的新更新仍须触发下一轮投影。
    session.projectionDirty = false;
    if (session.cacheWriteFailed) {
      runtime.store.compact(session.info.id, session.doc);
      session.cacheWriteFailed = false;
      session.dirty = false;
    }
    const source = session.info.source;
    const database = source && databaseModule.getDatabase(source.databaseName);
    stage = "assets";
    await runtime.sharedEffects?.preserveOwnerImages(session);
    if (
      !source ||
      !database?.open ||
      databaseModule.getDatabase(source.databaseName) !== database ||
      runtime.sessions.get(session.info.id) !== session ||
      session.info.source !== source
    ) {
      session.projectionDirty = true;
      return;
    }
    const local = session.info.mode === "local";
    if (local && findCollaborationBinding(database, source.contentId)) {
      session.projectionDirty = true;
      reportContentSaveIssue(session, "binding-changed");
      return;
    }
    stage = "identity";
    expectedRevision = source.projectionRevision;
    const projection = runtime.storage.projection(database, source, session.info);
    const head = projection.readHead();
    actualRevision = head.revision;
    storageBefore = head.formatVersion;
    if (!local && expectedRevision && expectedRevision !== head.revision)
      throw new Error("共享正文投影修订已变化，原共享会话仍保留");
    // 只确认本轮快照的代次，异步期间到达的新事务留给下一轮。
    const version = session.projectionVersion && { ...session.projectionVersion };
    const confirmed = session.projectedVersion;
    const changes =
      version && confirmed
        ? {
            content: version.content !== confirmed.content,
            contracts: version.contracts !== confirmed.contracts,
          }
        : undefined;
    if (changes && head.revision !== expectedRevision)
      throw new Error("正文投影修订冲突，已保留原缓存并暂停写入");
    let changed = false;
    if (!changes || changes.content || changes.contracts) {
      const contracts = session.doc
        .getMap("node-tree:contracts")
        .toJSON() as ContentContractDictionary;
      const tree = session.projectionTree;
      const incrementalScope =
        changes && confirmed && version && tree ? { changes, confirmed, version, tree } : undefined;
      const structural = Boolean(
        incrementalScope &&
        incrementalScope.changes.content &&
        (session.projectionStructure ?? 0) > incrementalScope.confirmed.content
      );
      path = !incrementalScope
        ? "reconcile"
        : structural
          ? "structure"
          : incrementalScope.changes.content
            ? "blocks"
            : "contracts";
      let content: ContentNode[];
      if (changes && !changes.content) content = [];
      else if (incrementalScope && !structural) {
        const roots = new Set<string>();
        for (const [id, changedAt] of session.projectionNodes ?? []) {
          if (
            changedAt <= incrementalScope.confirmed.content ||
            changedAt > incrementalScope.version.content
          )
            continue;
          const root = incrementalScope.tree.rootBlockId(id);
          if (root) roots.add(root);
        }
        content = [...roots].map(id => incrementalScope.tree.nodeSnapshot(id));
      } else
        content = tree ? (tree.snapshot() as ContentNode[]) : readNodeDocument(session.doc).content;
      if (content.length) {
        stage = "localize";
        const meta = session.doc.getMap("meta");
        const value = await runtime.assets.localizeDocument(
          session.info.serverUrl,
          session.info.id,
          {
            title: session.doc.getText("title").toString(),
            bannerBg: String(meta.get("bannerBg")),
            bannerPosition: String(meta.get("bannerPosition")),
            content,
          },
          contracts
        );
        content = value.content;
      }
      selectedBlocks = content.length;
      if (
        databaseModule.getDatabase(source.databaseName) !== database ||
        !database.open ||
        runtime.sessions.get(session.info.id) !== session ||
        session.info.source !== source
      ) {
        session.projectionDirty = true;
        reportContentSaveIssue(session, "target-changed");
        return;
      }
      stage = "commit";
      // 资源本地化期间，其他入口可能已提交并推进会话观察到的修订。
      let result: { changed: boolean; writtenBlocks: number };
      if (incrementalScope) {
        if (!expectedRevision) throw new Error("增量投影缺少基准修订");
        result = projection.commit({
          kind: "blocks",
          documentId: head.documentId,
          expectedRevision,
          contracts,
          blocks: content,
          order: structural ? content.map(node => String(node.collabId)) : undefined,
          count: blocks => getContentLength(blocks as import("slate").Descendant[]),
          countRules: JSON.stringify(desktopContentMetrics.rules),
        });
      } else {
        result = projection.commit({
          kind: "snapshot",
          documentId: head.documentId,
          expectedRevision,
          contracts,
          content,
          count: getContentLength(content as import("slate").Descendant[]),
          changes,
        });
      }
      changed = result.changed;
      writtenBlocks = result.writtenBlocks;
      committed = true;
    }
    stage = "acknowledge";
    const saved = projection.readHead();
    source.projectionRevision = saved.revision;
    session.projectedVersion = version;
    const pendingNodes = session.projectionNodes;
    if (pendingNodes)
      for (const [id, changedAt] of pendingNodes)
        if (version && changedAt <= version.content) pendingNodes.delete(id);
    runtime.store.metadata(session.info);
    stage = "notify";
    const title = session.doc.getText("title").toString();
    for (const entry of projectContentTitle(database, source.contentId, title))
      runtime.broadcast(entry.channel, {
        databaseName: basename(database.name),
        [entry.field]: entry.id,
      });
    if (changed) {
      runtime.broadcast("content:updated", {
        databaseName: basename(database.name),
        contentId: source.contentId,
      });
      emitContentWritten(database, source.contentId, "update");
    }
    session.info.title = title;
    if ((local || session.info.error?.startsWith("正文缓存尚未保存：")) && session.info.error) {
      session.info.error = undefined;
      runtime.changed(session);
    }
    if (version && session.projectionVersion)
      session.projectionDirty =
        version.content !== session.projectionVersion.content ||
        version.contracts !== session.projectionVersion.contracts;
    reportContentSaveComplete(session, {
      path,
      changed,
      selectedBlocks,
      writtenBlocks,
      elapsedMs: Math.round(performance.now() - started),
      storageBefore,
      storageAfter: saved.formatVersion,
    });
  } catch (error) {
    session.projectionDirty = true;
    reportContentSaveIssue(session, stage, error, {
      elapsedMs: Math.round(performance.now() - started),
      committed,
      expectedRevision,
      actualRevision,
    });
    throw error;
  }
}
