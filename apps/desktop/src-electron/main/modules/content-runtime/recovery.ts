import { createHash } from "node:crypto";
import * as Y from "yjs";
import {
  NodeTree,
  replaceText,
  readDocumentIdentity,
  validateNodeDocument,
  type CollaborationSession,
} from "@tau/collaboration";
import type { CollaborationLocalStore } from "../collaboration/local-store";
import { sourceDraftKey, type ContentLocalState } from "../collaboration/content-local-state";

const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** 仅重放与日志同基线的未确认正文，日志与草稿一起保留到恢复检查点写入成功。 */
export async function recoverContentDrafts(
  store: CollaborationLocalStore,
  state: ContentLocalState,
  info: CollaborationSession,
  doc: Y.Doc,
  isCurrent: () => boolean
) {
  if (!info.source) return;
  const identity = readDocumentIdentity(doc);
  const drafts = state
    .documentDrafts(info.source.databaseName)
    .filter(
      draft =>
        draft.documentId === info.id &&
        draft.baselineId === identity.baselineId &&
        draft.epoch === identity.epoch
    );

  for (const draft of drafts) {
    if (hash(draft.state) !== draft.digest) continue;
    const candidate = new Y.Doc({ gc: false });
    try {
      if (!isCurrent()) return;
      const before = Y.encodeStateAsUpdate(doc);
      Y.applyUpdate(candidate, before);
      Y.applyUpdate(candidate, draft.state);
      const next = readDocumentIdentity(candidate);
      if (
        next.documentId !== identity.documentId ||
        next.baselineId !== identity.baselineId ||
        next.epoch !== identity.epoch ||
        candidate.store.pendingStructs ||
        candidate.store.pendingDs
      )
        continue;
      await validateNodeDocument(candidate, identity, doc, { allowLocalResources: true });
      if (!isCurrent() || hash(before) !== hash(Y.encodeStateAsUpdate(doc))) return;
      const delta = Y.encodeStateAsUpdate(candidate, Y.encodeStateVector(doc));
      store.db.transaction(() => {
        store.append(info.id, delta);
        state.confirmDocumentDrafts(
          info.id,
          identity.baselineId,
          identity.epoch,
          bytes => hash(bytes) === draft.digest
        );
      })();
      Y.applyUpdate(doc, delta, "renderer-persisted");
    } catch (error) {
      if ((error as { code?: string }).code?.startsWith("SQLITE_")) throw error;
      console.warn("[local-content] 未确认副本暂未合入，原副本保留");
    } finally {
      candidate.destroy();
    }
  }
  await recoverSourceInputs(store, state, info, doc, isCurrent);
}

export function saveSourceInput(
  store: CollaborationLocalStore,
  state: ContentLocalState,
  identity: import("../collaboration/content-local-state").InputDraftIdentity,
  viewId: string,
  draft: import("@tau/collaboration").ContentInputDraft
) {
  if (
    draft.baseValue !== undefined &&
    (typeof draft.baseValue !== "string" || Buffer.byteLength(draft.baseValue) > 8 * 1024 * 1024)
  )
    throw new Error("源码草稿基线无效");
  const key = sourceDraftKey(viewId, draft.nodeId, draft.field);
  store.db.transaction(() => {
    state.saveInputDraft(identity, viewId, draft);
    const row = store.db
      .prepare(
        "SELECT sequence,applied FROM input_drafts WHERE view_id=? AND node_id=? AND field=?"
      )
      .get(viewId, draft.nodeId, draft.field) as { sequence: number; applied: number } | undefined;
    if (row?.sequence === draft.sequence && !row.applied && typeof draft.baseValue === "string") {
      const old = store.get<{ sequence: number; value: string } | null>(key, null);
      if (old?.sequence === draft.sequence && old.value !== draft.baseValue)
        throw new Error("源码草稿基线冲突");
      store.set(key, { sequence: draft.sequence, value: draft.baseValue });
    }
  })();
}

async function recoverSourceInputs(
  store: CollaborationLocalStore,
  state: ContentLocalState,
  info: CollaborationSession,
  doc: Y.Doc,
  isCurrent: () => boolean
) {
  if (!info.source || !isCurrent()) return;
  const identity = readDocumentIdentity(doc);
  const drafts = state
    .inputDrafts(info.source.databaseName)
    .filter(
      draft =>
        draft.documentId === info.id &&
        draft.baselineId === identity.baselineId &&
        draft.epoch === identity.epoch
    );
  if (!drafts.length) return;
  const candidate = new Y.Doc({ gc: false });
  const tree = new NodeTree(candidate);
  try {
    const before = Y.encodeStateAsUpdate(doc);
    Y.applyUpdate(candidate, before);
    const vector = Y.encodeStateVector(doc);
    const read = (node: string, field: string) =>
      tree.nodes.has(node) &&
      !tree.isDeleted(node) &&
      tree.contract(node)?.textFields.includes(field)
        ? tree.textField(node, field)
        : undefined;
    let hasRecoveredInput = false;
    candidate.transact(() => {
      for (const draft of drafts) {
        const key = sourceDraftKey(draft.viewId, draft.nodeId, draft.field);
        const field = read(draft.nodeId, draft.field);
        if (!field) continue;
        const current = field.toString();
        const base = store.get<{ sequence: number; value: string } | null>(key, null);
        if (current !== draft.value && base?.sequence === draft.sequence && base.value === current)
          replaceText(field, draft.value);
        if (field.toString() === draft.value) hasRecoveredInput = true;
      }
    });
    if (!hasRecoveredInput || !isCurrent()) return;
    await validateNodeDocument(candidate, identity, doc, { allowLocalResources: true });
    if (!isCurrent() || hash(before) !== hash(Y.encodeStateAsUpdate(doc))) return;
    const delta = Y.encodeStateAsUpdate(candidate, vector);
    store.db.transaction(() => {
      store.append(info.id, delta);
      state.confirmInputDrafts(info.id, identity.baselineId, identity.epoch, (node, field) =>
        read(node, field)?.toString()
      );
    })();
    Y.applyUpdate(doc, delta, "renderer-persisted");
  } catch (error) {
    if ((error as { code?: string }).code?.startsWith("SQLITE_")) throw error;
    console.warn("[local-content] 源码草稿暂未合入，原草稿保留");
  } finally {
    tree.dispose();
    candidate.destroy();
  }
}
