import type Database from "better-sqlite3";
import { createHash, randomUUID } from "node:crypto";
import * as Y from "yjs";
import {
  DocumentHistoryStore,
  NODE_DOCUMENT_VERSION,
  NodeTree,
  type DocumentHistoryActor,
} from "@tau/collaboration";
import { applyNodeTreeContent } from "@tau/editor-collab";
import type { StoredContentDocument } from "../tables/content-document";
import { findContentTitle } from "../collaboration/content-sessions";

const revision = (state: Uint8Array) => createHash("sha256").update(state).digest("hex");

export function sqliteDocumentHistory(db: Database.Database): DocumentHistoryStore {
  return new DocumentHistoryStore({
    exec: (sql, ...values) => {
      db.prepare(sql).run(...values);
    },
    all: <Row>(sql: string, ...values: (string | number | Uint8Array)[]) =>
      db.prepare(sql).all(...values) as Row[],
  });
}

function seed(content: StoredContentDocument, title: string): Y.Doc {
  const doc = new Y.Doc({ gc: false });
  const tree = new NodeTree(doc);
  try {
    doc.transact(() => {
      const meta = doc.getMap("meta");
      meta.set("documentId", content.documentId);
      meta.set("baselineId", randomUUID());
      meta.set("epoch", 0);
      meta.set("version", NODE_DOCUMENT_VERSION);
      meta.set("bannerBg", "");
      meta.set("bannerPosition", "center");
      doc.getText("title").insert(0, title);
      for (const [id, contract] of Object.entries(content.contracts))
        tree.contracts.set(id, contract);
      for (const [index, block] of content.content.entries())
        tree.insertNode(block, null, index, null, true);
    });
    return doc;
  } catch (error) {
    doc.destroy();
    throw error;
  } finally {
    tree.dispose();
  }
}

/** 调用方在提交主库快照的同一 SQLite 事务中记录。 */
export function recordClosedContent(
  db: Database.Database,
  contentId: number,
  before: StoredContentDocument,
  after: StoredContentDocument,
  actor: DocumentHistoryActor
): void {
  if (before.revision === after.revision) return;
  const history = sqliteDocumentHistory(db);
  const id = before.documentId;
  const head = history.head(id);
  const title = findContentTitle(db, contentId);
  const doc =
    head && history.entry(id, head.sequence).sourceRevision === before.revision
      ? history.replay(id, head.sequence)
      : seed(before, title);
  const tree = new NodeTree(doc);
  try {
    const state = Y.encodeStateAsUpdate(doc),
      vector = Y.encodeStateVector(doc);
    for (const [id, contract] of Object.entries(after.contracts))
      if (!tree.contracts.has(id)) tree.contracts.set(id, contract);
    applyNodeTreeContent(tree, after.content, {});
    const current = Y.encodeStateAsUpdate(doc);
    history.append(id, {
      operationId: randomUUID(),
      actor,
      previousRevision: revision(state),
      revision: revision(current),
      update: Y.encodeStateAsUpdate(doc, vector),
      before: () => state,
      after: () => current,
      sourceRevision: after.revision,
      // 打开正文时按序号游标导入，已导入的记录不能再被合并改写
      mergeable: false,
    });
  } finally {
    tree.dispose();
    doc.destroy();
  }
}

export function importClosedContentHistory(
  db: Database.Database,
  archiveDb: Database.Database,
  target: DocumentHistoryStore,
  documentId: string,
  historyId: string
): void {
  const source = sqliteDocumentHistory(db);
  const key = `closed-history:${historyId}:${documentId}`;
  const cursor = archiveDb.prepare("SELECT value FROM settings WHERE key=?").get(key) as
    | { value: string }
    | undefined;
  let sequence = cursor ? Number(cursor.value) : -1;
  archiveDb.transaction(() => {
    for (;;) {
      const rows = source.entriesAfter(documentId, sequence);
      if (!rows.length) break;
      for (const row of rows) {
        sequence = row.sequence;
        if (row.kind === "baseline" || target.operation(historyId, row.operationId)) continue;
        const before = source.replay(documentId, row.sequence - 1);
        const after = source.replay(documentId, row.sequence);
        try {
          const state = Y.encodeStateAsUpdate(before),
            current = Y.encodeStateAsUpdate(after);
          target.append(historyId, {
            operationId: row.operationId,
            actor: { actorId: row.actorId, actorName: row.actorName, source: row.source },
            previousRevision: revision(state),
            revision: revision(current),
            update: Y.encodeStateAsUpdate(after, Y.encodeStateVector(before)),
            before: () => state,
            after: () => current,
            time: row.time,
            sourceRevision: row.sourceRevision,
            mergeable: false,
          });
        } finally {
          before.destroy();
          after.destroy();
        }
      }
      archiveDb
        .prepare(
          "INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
        )
        .run(key, String(sequence));
    }
  })();
}
