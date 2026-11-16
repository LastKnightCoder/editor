import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { removeAwarenessStates } from "y-protocols/awareness";
import databaseModule from "../database";
import { unregisterContentSession } from "../collaboration/content-sessions";
import { sourceDraftKey } from "../collaboration/content-local-state";
import { contentDemotionKey } from "./local-content-demotion";
import type { RuntimeSession } from "../collaboration/types";
import type { ContentSessionRuntime } from "./index";

export function removeWindowViews(runtime: ContentSessionRuntime, windowId: number) {
  runtime.lifecycle.cancelOpening({ windowId });
  for (const [id, view] of runtime.views) if (view.windowId === windowId) runtime.removeView(id);
}

export function removeStoredSession(
  runtime: ContentSessionRuntime,
  id: string,
  onRemove?: () => void
) {
  runtime.store.db.transaction(() => {
    runtime.store.remove(id);
    runtime.contentState?.db
      .prepare("DELETE FROM entity_holds WHERE holder=?")
      .run(`document:${id}`);
    onRemove?.();
  })();
}

export async function removeSession(
  runtime: ContentSessionRuntime,
  session: RuntimeSession,
  onRemove?: () => void
) {
  const id = session.info.id;
  if (runtime.sessions.get(id) !== session) return;
  const freeze =
    !session.info.frozen && [...runtime.views.values()].some(view => view.documentId === id);
  if (freeze) await runtime.freeze(session);
  if (runtime.sessions.get(id) !== session) return;
  try {
    runtime.removeStoredSession(id, onRemove);
  } catch (error) {
    if (freeze) runtime.unfreeze(session);
    throw error;
  }
  for (const [viewId, view] of runtime.views)
    if (view.documentId === id) runtime.removeView(viewId);
  unregisterContentSession(session);
  session.provider?.destroy();
  session.awareness.destroy();
  session.doc.destroy();
  runtime.sessions.delete(id);
  runtime.frozenForDownload.delete(session);
  runtime.assets.removeDocumentCache(id);
  runtime.broadcast("collaboration:removed", { documentId: id });
  runtime.changed();
}

export function discardRemoteSession(
  runtime: ContentSessionRuntime,
  session: RuntimeSession,
  reason: string
) {
  const id = session.info.id;
  if (runtime.sessions.get(id) !== session) return;
  for (const [viewId, view] of runtime.views)
    if (view.documentId === id) runtime.removeView(viewId);
  unregisterContentSession(session);
  session.provider?.destroy();
  if (session.dirty) runtime.store.compact(id, session.doc);
  runtime.store.discard(id, reason);
  session.awareness.destroy();
  session.doc.destroy();
  runtime.sessions.delete(id);
  runtime.contentState.db.prepare("DELETE FROM entity_holds WHERE holder=?").run(`document:${id}`);
  runtime.broadcast("collaboration:removed", { documentId: id, replaced: true });
}

export function releaseReplacedSession(
  runtime: ContentSessionRuntime,
  session: RuntimeSession,
  reason = "资料库或正文身份已变化"
) {
  const id = session.info.id;
  // 先保全原始材料，磁盘失败时保留仍可重试的旧会话和视图。
  if (session.dirty || session.cacheWriteFailed) runtime.store.compact(id, session.doc);
  runtime.store.discard(id, reason);
  for (const [viewId, view] of runtime.views)
    if (view.documentId === id) runtime.removeView(viewId);
  unregisterContentSession(session);
  session.awareness.destroy();
  session.doc.destroy();
  runtime.sessions.delete(id);
  runtime.frozenForDownload.delete(session);
  runtime.contentState?.db.prepare("DELETE FROM entity_holds WHERE holder=?").run(`document:${id}`);
  runtime.assets.removeDocumentCache(id);
  runtime.broadcast("collaboration:removed", { documentId: id, replaced: true });
}

export function releaseLibrary(runtime: ContentSessionRuntime, name: string): void {
  const workspace = name.replace(/\.db$/, "");
  const names = [workspace, `${workspace}.db`] as const;
  runtime.store.db.transaction(() => {
    const inputs = runtime.store.db
      .prepare("SELECT * FROM input_drafts WHERE workspace_id IN (?,?)")
      .all(...names) as { view_id: string; node_id: string; field: string; applied: number }[];
    const documents = runtime.store.db
      .prepare("SELECT * FROM document_drafts WHERE workspace_id IN (?,?) AND applied=0")
      .all(...names) as (Record<string, unknown> & { state: Buffer })[];
    const demotions = runtime.store.db
      .prepare(
        `SELECT key,value FROM settings WHERE key GLOB ? AND
           CASE WHEN json_valid(value) THEN json_extract(value, '$.info.source.databaseName') END IN (?,?)`
      )
      .all(contentDemotionKey("*"), ...names) as { key: string; value: string }[];
    const readBase = runtime.store.db.prepare("SELECT value FROM settings WHERE key=?");
    const pending = inputs
      .filter(row => !row.applied)
      .map(row => {
        const key = sourceDraftKey(row.view_id, row.node_id, row.field);
        const base = readBase.get(key) as { value: string } | undefined;
        return { ...row, base: base?.value };
      });
    if (pending.length || documents.length || demotions.length) {
      const directory = join(dirname(runtime.store.db.name), "discarded");
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      writeFileSync(
        join(directory, `${Date.now()}-${randomUUID()}-drafts.json`),
        JSON.stringify({
          workspace,
          inputDrafts: pending,
          documentDrafts: documents.map(({ state, ...row }) => ({
            ...row,
            state: state.toString("base64"),
          })),
          ...(demotions.length ? { demotions } : {}),
        }),
        { mode: 0o600, flush: true }
      );
    }
    for (const row of inputs)
      runtime.store.delete(sourceDraftKey(row.view_id, row.node_id, row.field));
    for (const { key } of demotions) runtime.store.delete(key);
    for (const table of [
      "input_drafts",
      "document_drafts",
      "node_views",
      "entity_holds",
      "migrations",
    ])
      runtime.store.db.prepare(`DELETE FROM ${table} WHERE workspace_id IN (?,?)`).run(...names);
  })();
  const candidates = new Map(runtime.store.list().map(info => [info.id, info]));
  for (const session of runtime.sessions.values()) candidates.set(session.info.id, session.info);
  for (const info of candidates.values()) {
    if (info.mode !== "local" || info.source?.databaseName.replace(/\.db$/, "") !== workspace)
      continue;
    const session = runtime.sessions.get(info.id);
    if (session) runtime.releaseReplacedSession(session);
    else runtime.store.discard(info.id, "资料库已被下载替换");
  }
  runtime.changed();
}

export function removeView(runtime: ContentSessionRuntime, viewId: string) {
  const view = runtime.views.get(viewId);
  if (!view) return;
  runtime.acknowledgeFreeze(viewId, runtime.freezeWaiters.get(view.documentId)?.id);
  runtime.views.delete(viewId);
  const awareness = runtime.sessions.get(view.documentId)?.awareness;
  if (awareness) removeAwarenessStates(awareness, view.clientIds, "view-closed");
  const session = runtime.sessions.get(view.documentId);
  if (session?.info.mode !== "local") return;
  const closure = {};
  runtime.idleClosures.set(session, closure);
  const idle = () =>
    runtime.idleClosures.get(session) === closure &&
    runtime.sessions.get(session.info.id) === session &&
    !session.info.frozen &&
    ![...runtime.views.values()].some(entry => entry.documentId === session.info.id);
  setTimeout(() => {
    if (!idle()) return;
    void runtime
      .project(session)
      .then(() => {
        if (
          idle() &&
          !session.projectionDirty &&
          !runtime.contentState?.hasPendingDrafts(session.info.id) &&
          session.info.source &&
          databaseModule.getDatabase(session.info.source.databaseName)?.open
        )
          return runtime.removeSession(session);
      })
      .catch(error => {
        if (runtime.sessions.get(session.info.id) !== session) return;
        session.info.error = String(error);
        runtime.changed(session);
      });
  }, 250).unref();
}
