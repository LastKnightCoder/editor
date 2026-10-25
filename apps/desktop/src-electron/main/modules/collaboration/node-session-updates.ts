import * as Y from "yjs";
import {
  applyNodeDocumentUpdate,
  DocumentWriteQueue,
  NODE_DOCUMENT_VERSION,
  NodeTree,
} from "@tau/collaboration";
import type { RuntimeSession } from "./types";
import type { CollaborationLocalStore } from "./local-store";
import type { ContentLocalState } from "./content-local-state";

const equal = (left: Uint8Array, right: Uint8Array) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

/** 校验期间可能收到服务器增量；必须针对最新基线重验，再同步落盘与应用。 */
export class NodeSessionUpdates {
  private readonly queue = new DocumentWriteQueue(32 * 1024 * 1024, 16);
  constructor(
    private readonly store: CollaborationLocalStore,
    private readonly state?: ContentLocalState
  ) {}

  confirmDrafts(doc: Y.Doc, documentId: string): void {
    if (!this.state || doc.getMap("meta").get("version") !== NODE_DOCUMENT_VERSION) return;
    this.state.confirmDocumentDrafts(
      documentId,
      String(doc.getMap("meta").get("baselineId")),
      Number(doc.getMap("meta").get("epoch")),
      bytes => {
        const copy = new Y.Doc({ gc: false });
        try {
          Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
          const before = Y.encodeStateAsUpdate(copy);
          Y.applyUpdate(copy, bytes);
          return (
            !copy.store.pendingStructs &&
            !copy.store.pendingDs &&
            equal(before, Y.encodeStateAsUpdate(copy))
          );
        } catch {
          return false;
        } finally {
          copy.destroy();
        }
      }
    );
    const tree = new NodeTree(doc);
    try {
      this.state.confirmInputDrafts(
        documentId,
        String(doc.getMap("meta").get("baselineId")),
        Number(doc.getMap("meta").get("epoch")),
        (node, field) => {
          if (
            !tree.nodes.has(node) ||
            tree.isDeleted(node) ||
            !tree.contract(node)?.textFields.includes(field)
          )
            return undefined;
          const value = tree.fields(node).get(field);
          return value instanceof Y.Text ? value.toString() : undefined;
        }
      );
    } finally {
      tree.dispose();
    }
  }

  apply(session: RuntimeSession, update: Uint8Array, assertWritable: () => void): Promise<void> {
    const bytes = new Uint8Array(update);
    return this.queue.run(session.info.id, bytes.byteLength, async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        assertWritable();
        const meta = session.doc.getMap("meta");
        if (meta.get("version") !== NODE_DOCUMENT_VERSION)
          throw new Error("正文协议已变化，请重新打开");
        const identity = {
          documentId: session.info.id,
          baselineId: String(meta.get("baselineId")),
          epoch: Number(meta.get("epoch")),
        };
        const before = Y.encodeStateVector(session.doc),
          baseline = Y.encodeStateAsUpdate(session.doc);
        const candidate = await applyNodeDocumentUpdate(session.doc, bytes, identity);
        try {
          assertWritable();
          if (!equal(baseline, Y.encodeStateAsUpdate(session.doc))) continue;
          if (equal(baseline, Y.encodeStateAsUpdate(candidate))) {
            session.retainNodeState?.(candidate);
            this.store.compact(session.info.id, session.doc);
            this.confirmDrafts(session.doc, session.info.id);
            return;
          }
          const delta = Y.encodeStateAsUpdate(candidate, before);
          this.store.db.transaction(() => {
            session.retainNodeState?.(candidate);
            this.store.append(session.info.id, delta);
          })();
          Y.applyUpdate(session.doc, delta, "renderer-persisted");
          this.confirmDrafts(session.doc, session.info.id);
          return;
        } finally {
          candidate.destroy();
        }
      }
      throw new Error("正文持续变化，编辑尚未确认保存，请重试");
    });
  }
}
