import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { HISTORY_MERGE_IDLE_MS, type DocumentHistoryWrite } from "./document-history";
import { readNodeDocument } from "./node-document";
import {
  commitHistoryFixture,
  historyDocument,
  historyRevision,
  openHistoryFixture,
} from "./testing/document-history";

const paragraphText = (doc: Y.Doc) => {
  const [block] = readNodeDocument(doc).content;
  return (block.children ?? []).map(child => child.text ?? "").join("");
};

describe("正文编辑历史的连续编辑合并", () => {
  let fixture: Awaited<ReturnType<typeof historyDocument>>;
  let store: ReturnType<typeof openHistoryFixture>;
  beforeEach(async () => {
    fixture = await historyDocument();
    store = openHistoryFixture();
  });
  afterEach(() => {
    fixture.tree.dispose();
    fixture.doc.destroy();
    store.db.close();
  });

  it("同一作者的连续编辑合成一条版本，回放到最终正文", () => {
    const { doc, tree, id } = fixture,
      { history } = store;
    const edits = () => history.list(id).filter(row => row.kind === "edit");
    commitHistoryFixture(
      history,
      doc,
      "first",
      () => tree.insertText("block-0", 0, "早上，", null),
      "alice",
      undefined,
      { merge: true, time: 1_000 }
    );
    commitHistoryFixture(
      history,
      doc,
      "second",
      () => tree.insertText("block-0", 3, "好。", null),
      "alice",
      undefined,
      { merge: true, time: 30_000 }
    );
    expect(edits()).toMatchObject([
      {
        sequence: 1,
        kind: "edit",
        actorId: "alice",
        mergedCount: 1,
        firstTime: 1_000,
        time: 30_000,
      },
    ]);
    const replayed = history.replay(id, 1);
    try {
      expect(paragraphText(replayed)).toBe("早上，好。今天的天气很好。");
    } finally {
      replayed.destroy();
    }
  });

  it("停顿超过合并窗口才另起一条", () => {
    const { doc, tree, id } = fixture,
      { history } = store;
    const edits = () => history.list(id).filter(row => row.kind === "edit");
    commitHistoryFixture(
      history,
      doc,
      "first",
      () => tree.insertText("block-0", 0, "一", null),
      "alice",
      undefined,
      { merge: true, time: 1_000 }
    );
    commitHistoryFixture(
      history,
      doc,
      "second",
      () => tree.insertText("block-0", 1, "二", null),
      "alice",
      undefined,
      { merge: true, time: 1_000 + HISTORY_MERGE_IDLE_MS }
    );
    expect(edits()).toHaveLength(1);
    commitHistoryFixture(
      history,
      doc,
      "third",
      () => tree.insertText("block-0", 2, "三", null),
      "alice",
      undefined,
      { merge: true, time: 1_000 + HISTORY_MERGE_IDLE_MS * 2 + 1 }
    );
    expect(edits().map(row => [row.operationId, row.mergedCount ?? 0])).toEqual([
      ["third", 0],
      ["second", 1],
    ]);
  });

  it("不同作者或不同来源的改动各自成条", () => {
    const { doc, tree, id } = fixture,
      { history } = store;
    const edit = (operationId: string, actorId: string, source?: string, time?: number) =>
      commitHistoryFixture(
        history,
        doc,
        operationId,
        () => tree.insertText("block-0", 0, "字", null),
        actorId,
        undefined,
        { merge: true, source, time }
      );
    edit("mine-1", "alice", undefined, 1_000);
    edit("mine-2", "alice", undefined, 2_000);
    edit("agent", "alice", "agent-1", 3_000);
    edit("other", "bob", undefined, 4_000);
    expect(
      history
        .list(id)
        .filter(row => row.kind === "edit")
        .map(row => row.operationId)
    ).toEqual(["other", "agent", "mine-2"]);
  });

  it("撤销记录不与上一条编辑合并", () => {
    const { doc, tree, id } = fixture,
      { history } = store;
    commitHistoryFixture(
      history,
      doc,
      "first",
      () => tree.insertText("block-0", 0, "早上，", null),
      "alice",
      undefined,
      { merge: true, time: 1_000 }
    );
    commitHistoryFixture(
      history,
      doc,
      "undo-first",
      () => tree.deleteText("block-0", 0, 3, null),
      "alice",
      { kind: "undo", target: 1 },
      { merge: true, time: 2_000 }
    );
    expect(history.list(id).filter(row => row.kind !== "baseline")).toMatchObject([
      { sequence: 2, kind: "undo", target: 1 },
      { sequence: 1, kind: "edit" },
    ]);
  });

  it("关闭合并的写入每次都留下独立版本", () => {
    const { doc, tree, id } = fixture,
      { history } = store;
    for (const operationId of ["first", "second"])
      commitHistoryFixture(
        history,
        doc,
        operationId,
        () => tree.insertText("block-0", 0, "字", null),
        "alice",
        undefined,
        { merge: false, time: 1_000 }
      );
    expect(history.list(id).filter(row => row.kind === "edit")).toHaveLength(2);
  });

  it("重复送达同一操作不重复记录，被并掉的操作仍可追溯", () => {
    const { doc, tree, id } = fixture,
      { history } = store;
    const before = Y.encodeStateAsUpdate(doc),
      vector = Y.encodeStateVector(doc);
    tree.insertText("block-0", 0, "早上，", null);
    const after = Y.encodeStateAsUpdate(doc);
    const write: DocumentHistoryWrite = {
      operationId: "first",
      actor: { actorId: "alice", actorName: "alice" },
      previousRevision: historyRevision(before),
      revision: historyRevision(after),
      update: Y.encodeStateAsUpdate(doc, vector),
      before: () => before,
      after: () => after,
      merge: true,
      time: 1_000,
    };
    history.append(id, write);
    history.append(id, write);
    expect(history.list(id).filter(row => row.kind === "edit")).toHaveLength(1);
    commitHistoryFixture(
      history,
      doc,
      "merged-away",
      () => tree.insertText("block-0", 3, "好。", null),
      "alice",
      undefined,
      { merge: true, time: 2_000 }
    );
    expect(history.list(id).filter(row => row.kind === "edit")).toHaveLength(1);
    expect(history.operation(id, "merged-away")).toMatchObject({
      sequence: 1,
      operationId: "merged-away",
      mergedCount: 1,
    });
  });

  it("连续合并写进同一分片，载荷不随合并次数增长", () => {
    const { doc, tree, id } = fixture,
      { history } = store;
    const edits = 20;
    for (let index = 0; index < edits; index++)
      commitHistoryFixture(
        history,
        doc,
        `edit-${index}`,
        () => tree.insertText("block-0", 0, "字", null),
        "alice",
        undefined,
        { merge: true, time: 1_000 + index * 1_000 }
      );
    const [entry] = history.list(id).filter(row => row.kind === "edit");
    expect(entry.mergedCount).toBe(edits - 1);
    const parts = store.db
      .prepare(
        "SELECT COUNT(*) AS count FROM document_history_payloads WHERE document_id=? AND sequence=?"
      )
      .get(id, entry.sequence) as { count: number };
    expect(parts.count).toBe(1);
    const replayed = history.replay(id, entry.sequence);
    try {
      expect(paragraphText(replayed)).toBe(`${"字".repeat(edits)}今天的天气很好。`);
    } finally {
      replayed.destroy();
    }
  });
});
