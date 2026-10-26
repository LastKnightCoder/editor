import { createHash } from "node:crypto";
import * as Y from "yjs";
import type { CollaborationStore } from "../store";

/** 模拟存储被替换为另一基线，测试旧客户端的拒绝与本机内容保留。 */
export function replaceStoredBaseline(store: CollaborationStore, id: string, doc: Y.Doc) {
  const protocol = store.protocols.state(id);
  const state = Y.encodeStateAsUpdate(doc);
  const meta = doc.getMap("meta");
  store.db.transaction(() => {
    store.db
      .prepare("UPDATE snapshots SET state=? WHERE document_id=?")
      .run(Buffer.from(state), id);
    store.db.prepare("DELETE FROM updates WHERE document_id=?").run(id);
    store.db.prepare("UPDATE collaboration_protocol SET value=? WHERE document_id=?").run(
      JSON.stringify({
        ...protocol,
        epoch: meta.get("epoch"),
        baselineId: meta.get("baselineId"),
        version: meta.get("version"),
        revision: createHash("sha256").update(state).digest("hex"),
      }),
      id
    );
    store.operations.advance(id);
  })();
  store.protocols.invalidate(id);
}
