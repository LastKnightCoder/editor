import Database from "better-sqlite3";
import { existsSync } from "node:fs";
import { join } from "node:path";
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
const imported = "legacy-local-content-imported";

/** 先复制并耐久提交，再允许独立正文库对外提供服务。旧库保留用于离线恢复。 */
export function importLegacyContent(appDirectory: string, target: CollaborationLocalStore): void {
  if (target.get(imported, false)) return;
  const path = join(appDirectory, "collaboration", "collaboration.db");
  if (!existsSync(path)) {
    target.set(imported, true);
    return;
  }
  let legacy: Database.Database | undefined;
  try {
    legacy = new Database(path, { readonly: true, fileMustExist: true });
    const source = legacy;
    const tables = new Set(
      (
        source.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
          name: string;
        }[]
      ).map(row => row.name)
    );
    if (!tables.has("sessions")) return;
    const read = (table: string, where = "") =>
      tables.has(table)
        ? (source.prepare(`SELECT * FROM ${table} ${where}`).all() as Record<string, unknown>[])
        : [];
    const sessions = read(
      "sessions",
      "WHERE CASE WHEN json_valid(metadata) THEN json_extract(metadata,'$.mode')='local' ELSE 0 END"
    );
    const copy = [
      {
        table: "updates",
        columns: ["document_id", "state", "hash"],
        rows: read("updates", "ORDER BY id"),
      },
      {
        table: "resources",
        columns: ["id", "document_id", "name", "mime", "path", "uploaded"],
        rows: read("resources"),
      },
      {
        table: "input_drafts",
        columns: [
          "workspace_id",
          "document_id",
          "baseline_id",
          "epoch",
          "view_id",
          "node_id",
          "field",
          "value",
          "revision",
          "sequence",
          "applied",
          "updated_at",
        ],
        rows: read("input_drafts"),
      },
      {
        table: "document_drafts",
        columns: [
          "view_id",
          "workspace_id",
          "document_id",
          "baseline_id",
          "epoch",
          "state",
          "digest",
          "sequence",
          "applied",
        ],
        rows: read("document_drafts"),
      },
      {
        table: "node_views",
        columns: ["workspace_id", "document_id", "node_id", "owner", "value", "revision"],
        rows: read("node_views"),
      },
    ];
    const settings = read(
      "settings",
      "WHERE key LIKE 'publishing:%' OR key LIKE 'scoped-edit:local:%'"
    );
    target.db.transaction(() => {
      const add = target.db.prepare(
        "INSERT OR IGNORE INTO sessions(id,metadata,state,state_hash) VALUES (?,?,?,?)"
      );
      const moved = new Set<string>();
      const documents = new Set<string>();
      for (const row of sessions) {
        const info = JSON.parse(String(row.metadata)) as CollaborationSession;
        if (info.id !== row.id || !Buffer.isBuffer(row.state)) continue;
        if (!add.run(row.id, row.metadata, row.state, row.state_hash ?? null).changes) continue;
        moved.add(info.id);
        documents.add(info.source?.contentDocumentId ?? info.id);
      }
      for (const { table, columns, rows } of copy) {
        const insert = target.db.prepare(
          `INSERT OR IGNORE INTO ${table}(${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`
        );
        const owners = table === "node_views" ? documents : moved;
        for (const row of rows)
          if (owners.has(String(row.document_id)))
            insert.run(...columns.map(column => row[column] ?? null));
      }
      const addSetting = target.db.prepare(
        "INSERT OR IGNORE INTO settings(key,value) VALUES (?,?)"
      );
      for (const row of settings) {
        const key = String(row.key);
        const id = key.startsWith("publishing:")
          ? key.slice("publishing:".length)
          : key.split(":").slice(1, 3).join(":");
        if (moved.has(id)) addSetting.run(row.key, row.value);
      }
      target.set(imported, true);
    })();
  } catch (failure) {
    const code = (failure as { code?: string }).code;
    if (code !== "SQLITE_NOTADB" && !code?.startsWith("SQLITE_CORRUPT")) throw failure;
    console.warn("[local-content] 旧协作库不可读取，保留原库供恢复");
  } finally {
    legacy?.close();
  }
}

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
