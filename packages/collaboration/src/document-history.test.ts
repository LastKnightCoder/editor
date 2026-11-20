import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { buildDocumentHistoryUpdate } from "./document-history-edit";
import { readNodeDocument } from "./node-document";
import {
  commitHistoryFixture,
  historyDocument,
  historyRevision,
  openHistoryFixture,
} from "./testing/document-history";

describe("正文编辑历史", () => {
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

  it("撤销旧文字编辑时保留同一段后续不相交的改动，并记录撤销来源", async () => {
    const { doc, tree, id } = fixture,
      { history } = store;
    commitHistoryFixture(
      history,
      doc,
      "first",
      () => tree.insertText("block-0", 0, "早上，", null),
      "alice"
    );
    commitHistoryFixture(
      history,
      doc,
      "second",
      () => tree.insertText("block-0", 11, "出去走走。", null),
      "bob"
    );
    const undo = { kind: "undo", operationId: "undo-first", sequence: 1 } as const;
    const update = await buildDocumentHistoryUpdate(history, id, doc, undo, "", "alice", false);
    commitHistoryFixture(
      history,
      doc,
      undo.operationId,
      () => Y.applyUpdate(doc, update),
      "alice",
      { kind: "undo", target: 1 }
    );
    expect(
      tree
        .snapshot()[0]
        .children?.map(node => node.text)
        .join("")
    ).toBe("今天的天气很好。出去走走。");
    expect(history.list(id)[0]).toMatchObject({ kind: "undo", target: 1, actorId: "alice" });
    await expect(
      buildDocumentHistoryUpdate(history, id, doc, undo, "", "alice", false)
    ).rejects.toMatchObject({ code: "SCOPE_CONFLICT" });
  });

  it("目标被别人改动时整组撤销失败，未冲突部分也不写回", async () => {
    const { doc, tree, id } = fixture,
      { history } = store;
    commitHistoryFixture(
      history,
      doc,
      "first",
      () =>
        doc.transact(() => {
          tree.insertText("block-0", 0, "早上，", null);
          tree.insertText("block-1", 0, "问候，", null);
        }),
      "alice"
    );
    commitHistoryFixture(
      history,
      doc,
      "second",
      () => tree.deleteText("block-0", 0, 1, null),
      "bob"
    );
    const before = readNodeDocument(doc);
    await expect(
      buildDocumentHistoryUpdate(
        history,
        id,
        doc,
        { kind: "undo", operationId: "undo-first", sequence: 1 },
        "",
        "alice",
        false
      )
    ).rejects.toMatchObject({ code: "SCOPE_CONFLICT" });
    expect(readNodeDocument(doc)).toEqual(before);
  });

  it("撤销同组的两个文字改动时保留夹在中间的独立输入", async () => {
    const { doc, tree, id } = fixture,
      { history } = store;
    commitHistoryFixture(
      history,
      doc,
      "outer",
      () =>
        doc.transact(() => {
          tree.insertText("block-0", 0, "前缀", null);
          tree.insertText("block-0", 10, "后缀", null);
        }),
      "alice"
    );
    commitHistoryFixture(
      history,
      doc,
      "middle",
      () => tree.insertText("block-0", 5, "［后来］", null),
      "bob"
    );
    Y.applyUpdate(
      doc,
      await buildDocumentHistoryUpdate(
        history,
        id,
        doc,
        {
          kind: "undo",
          operationId: "undo-outer",
          sequence: 1,
        },
        "",
        "alice",
        false
      )
    );
    expect(
      tree
        .snapshot()[0]
        .children?.map(node => node.text)
        .join("")
    ).toBe("今天的［后来］天气很好。");
  });

  it("恢复旧版提前校验修订并保留恢复前的正文", async () => {
    const { doc, tree, id } = fixture,
      { history } = store;
    commitHistoryFixture(history, doc, "delete", () => tree.removeNode("block-0", null));
    const stale = {
      kind: "restore",
      operationId: "restore",
      sequence: 0,
      expectedRevision: "0".repeat(64),
    } as const;
    const revision = historyRevision(Y.encodeStateAsUpdate(doc));
    await expect(
      buildDocumentHistoryUpdate(history, id, doc, stale, revision, "owner", true)
    ).rejects.toMatchObject({ code: "CONTENT_VERSION_CONFLICT" });
    await expect(
      buildDocumentHistoryUpdate(
        history,
        id,
        doc,
        { ...stale, expectedRevision: revision },
        revision,
        "bob",
        false
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const restored = await buildDocumentHistoryUpdate(
      history,
      id,
      doc,
      { ...stale, expectedRevision: revision },
      revision,
      "owner",
      true
    );
    commitHistoryFixture(history, doc, "restore", () => Y.applyUpdate(doc, restored), "owner", {
      kind: "restore",
      target: 0,
    });
    expect(tree.snapshot().map(node => node.children?.[0].text)).toEqual([
      "今天的天气很好。",
      "今天的天气很好。",
    ]);
    const previous = history.replay(id, 1);
    try {
      expect(readNodeDocument(previous).content.map(block => block.collabId)).toEqual(["block-1"]);
    } finally {
      previous.destroy();
    }
  });

  it("用字符身份撤销重复文字中的原插入，保留后来改动的旧字符", async () => {
    const { doc, tree, id } = fixture,
      { history } = store;
    tree.deleteText("block-0", 0, 8, null);
    tree.insertText("block-0", 0, "aaa", null);
    commitHistoryFixture(
      history,
      doc,
      "first-a",
      () => tree.insertText("block-0", 0, "a", null),
      "alice"
    );
    commitHistoryFixture(
      history,
      doc,
      "last-b",
      () =>
        doc.transact(() => {
          tree.deleteText("block-0", 3, 1, null);
          tree.insertText("block-0", 3, "b", null);
        }),
      "bob"
    );
    const inverse = await buildDocumentHistoryUpdate(
      history,
      id,
      doc,
      {
        kind: "undo",
        operationId: "undo-first-a",
        sequence: 1,
      },
      "",
      "alice",
      false
    );
    Y.applyUpdate(doc, inverse);
    expect(
      tree
        .snapshot()[0]
        .children?.map(node => node.text)
        .join("")
    ).toBe("aab");
  });
});
