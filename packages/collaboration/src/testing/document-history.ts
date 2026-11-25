import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import * as Y from "yjs";
import { DocumentHistoryStore, documentHistorySchema } from "../document-history";
import { NodeTree } from "../node-tree";
import { createTestDocument } from "./node-document";

export const historyRevision = (state: Uint8Array) =>
  createHash("sha256").update(state).digest("hex");
export const historyIdentity = { documentId: "history-test", baselineId: "baseline", epoch: 0 };

export function openHistoryFixture(path = ":memory:") {
  const db = new DatabaseSync(path);
  db.exec(documentHistorySchema);
  const history = new DocumentHistoryStore({
    exec: (statement, ...values) => {
      db.prepare(statement).run(...values);
    },
    all: <Row>(statement: string, ...values: (string | number | Uint8Array)[]) =>
      db.prepare(statement).all(...values) as Row[],
  });
  return { db, history };
}

export async function historyDocument(blocks = 2, text = "今天的天气很好。") {
  const doc = await createTestDocument(
    {
      title: "测试",
      bannerBg: "",
      bannerPosition: "center",
      content: Array.from({ length: blocks }, (_, index) => ({
        collabId: `block-${index}`,
        type: "paragraph",
        children: [{ text }],
      })),
    },
    historyIdentity
  );
  return { doc, tree: new NodeTree(doc), id: historyIdentity.documentId };
}

export function commitHistoryFixture(
  history: DocumentHistoryStore,
  live: Y.Doc,
  operationId: string,
  apply: () => void,
  actorId = "owner",
  action?: { kind: "restore" | "undo"; target: number },
  options?: { merge?: boolean; time?: number; source?: string }
) {
  const before = Y.encodeStateAsUpdate(live);
  const vector = Y.encodeStateVector(live);
  apply();
  const after = Y.encodeStateAsUpdate(live);
  history.append(historyIdentity.documentId, {
    operationId,
    actor: { actorId, actorName: actorId, source: options?.source },
    previousRevision: historyRevision(before),
    revision: historyRevision(after),
    before: () => before,
    after: () => after,
    update: Y.encodeStateAsUpdate(live, vector),
    merge: options?.merge,
    time: options?.time,
    ...action,
  });
}
