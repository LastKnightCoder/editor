import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { buildDocumentHistoryUpdate } from "./document-history-edit";
import { HISTORY_MERGE_IDLE_MS, HISTORY_MERGE_SPAN_MS } from "./document-history";
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

  describe("连续编辑合并", () => {
    const minute = 60_000;
    const edit = (
      operationId: string,
      time: number,
      apply: () => void,
      actorId = "alice",
      source?: string
    ) => {
      const live = fixture.doc;
      const before = Y.encodeStateAsUpdate(live);
      const vector = Y.encodeStateVector(live);
      apply();
      const after = Y.encodeStateAsUpdate(live);
      store.history.append(fixture.id, {
        operationId,
        actor: { actorId, actorName: actorId, source },
        previousRevision: historyRevision(before),
        revision: historyRevision(after),
        before: () => before,
        after: () => after,
        update: Y.encodeStateAsUpdate(live, vector),
        time,
      });
    };
    const text = (doc: Y.Doc) => readNodeDocument(doc).content[0].children?.[0].text;
    const type = (operationId: string, time: number, value: string, actorId?: string) =>
      edit(operationId, time, () => fixture.tree.insertText("block-0", 0, value, null), actorId);

    it("查看版本后继续输入，撤销只影响已查看的修改", async () => {
      const start = 1_000_000;
      type("seen", start, "已查看，");
      const preview = store.history.preview(fixture.id, 1, "", "alice", false);
      edit("later", start + minute, () =>
        fixture.tree.insertText("block-1", 0, "后来输入，", null)
      );
      const update = await buildDocumentHistoryUpdate(
        store.history,
        fixture.id,
        fixture.doc,
        { kind: "undo", operationId: "undo-seen", sequence: preview.entry.sequence },
        "",
        "alice",
        false
      );
      Y.applyUpdate(fixture.doc, update);
      expect(text(fixture.doc)).toBe("今天的天气很好。");
      expect(readNodeDocument(fixture.doc).content[1].children?.[0].text).toBe(
        "后来输入，今天的天气很好。"
      );
    });

    it("查看旧版本或其他作者重连不打断当前作者的编辑批次", () => {
      const start = 1_000_000;
      type("alice", start, "甲", "alice");
      type("bob-1", start + minute, "乙", "bob");
      store.history.preview(fixture.id, 1, "", "alice", false);
      store.history.seal(fixture.id, { actorId: "alice" });
      type("bob-2", start + 2 * minute, "丙", "bob");
      const rows = store.history.list(fixture.id);
      expect(rows[0]).toMatchObject({ operationId: "bob-2", startTime: start + minute });
      expect(store.history.entry(fixture.id, 1).operationId).toBe("alice");
    });

    it("同一作者重新连接后，保留连接前的版本", () => {
      const start = 1_000_000;
      type("before-reconnect", start, "甲");
      store.history.seal(fixture.id, { actorId: "alice" });
      type("after-reconnect", start + minute, "乙");
      const before = store.history.replay(fixture.id, 1);
      try {
        expect(text(before)).toBe("甲今天的天气很好。");
        expect(store.history.list(fixture.id)[0].operationId).toBe("after-reconnect");
      } finally {
        before.destroy();
      }
    });

    it("合并跨越回放预算后，检查点与后续编辑仍可完整回放", () => {
      const start = 1_000_000;
      type("large-first", start, "甲".repeat(240_000));
      type("large-second", start + minute, "乙".repeat(120_000));
      type("after-checkpoint", start + 2 * minute, "后续");
      const latest = store.history.head(fixture.id);
      if (!latest) throw new Error("缺少最新历史版本");
      const replayed = store.history.replay(fixture.id, latest.sequence);
      try {
        expect(text(replayed)).toBe(
          `后续${"乙".repeat(120_000)}${"甲".repeat(240_000)}今天的天气很好。`
        );
      } finally {
        replayed.destroy();
      }
    });

    it("合并载荷写入失败时，事务保留原版本及其完整内容", () => {
      type("accepted", 1_000_000, "原修改");
      const original = store.history.exportVersion(fixture.id, 1);
      store.db.exec(
        "CREATE TRIGGER fail_history BEFORE INSERT ON document_history_payloads BEGIN SELECT RAISE(ABORT,'injected-write-failure'); END"
      );
      store.db.exec("BEGIN");
      try {
        expect(() => type("rejected", 1_000_001, "新修改")).toThrow("injected-write-failure");
      } finally {
        store.db.exec("ROLLBACK");
      }
      expect(store.history.exportVersion(fixture.id, 1)).toEqual(original);
      const replayed = store.history.replay(fixture.id, 1);
      try {
        expect(text(replayed)).toBe("原修改今天的天气很好。");
      } finally {
        replayed.destroy();
      }
    });

    it("同一作者连续输入并为一条，回放得到最后的正文，重试按最近一次操作识别", () => {
      const start = 1_000_000;
      type("a", start, "一");
      type("b", start + minute, "二");
      type("c", start + 2 * minute, "三");
      const rows = store.history.list(fixture.id);
      // 第一条是基线，之后三次输入合为一条
      expect(rows.map(row => row.kind)).toEqual(["edit", "baseline"]);
      expect(rows[0]).toMatchObject({ startTime: start, time: start + 2 * minute });
      const replayed = store.history.replay(fixture.id, rows[0].sequence);
      expect(text(replayed)).toBe(text(fixture.doc));
      replayed.destroy();
      expect(store.history.operation(fixture.id, "c")?.sequence).toBe(rows[0].sequence);
    });

    it("停顿、超过时长、换作者、换来源或封口后另起一条", () => {
      const start = 1_000_000;
      const idleStart = start + HISTORY_MERGE_IDLE_MS + 1;
      const step = HISTORY_MERGE_IDLE_MS - minute;
      type("a", start, "一");
      type("idle", idleStart, "二");
      let time = idleStart;
      while (time + step - idleStart <= HISTORY_MERGE_SPAN_MS)
        type(`span-${(time += step)}`, time, "三");
      const overflow = time + step;
      type("overflow", overflow, "四");
      type("bob", overflow + minute, "五", "bob");
      edit(
        "ai",
        overflow + 2 * minute,
        () => fixture.tree.insertText("block-0", 0, "六", null),
        "bob",
        "AI"
      );
      store.history.seal(fixture.id);
      edit(
        "sealed",
        overflow + 3 * minute,
        () => fixture.tree.insertText("block-0", 0, "七", null),
        "bob",
        "AI"
      );
      const rows = store.history.list(fixture.id).reverse();
      expect(rows.map(row => row.startTime ?? row.time)).toEqual([
        start,
        start,
        idleStart,
        overflow,
        overflow + minute,
        overflow + 2 * minute,
        overflow + 3 * minute,
      ]);
      expect(rows[2].time).toBe(time);
      for (const row of rows) store.history.replay(fixture.id, row.sequence).destroy();
    });

    it("撤销记录不并入前一条，其后的编辑也不并入撤销", async () => {
      const start = 1_000_000;
      type("a", start, "一");
      const undo = { kind: "undo", operationId: "undo-a", sequence: 1 } as const;
      const update = await buildDocumentHistoryUpdate(
        store.history,
        fixture.id,
        fixture.doc,
        undo,
        "",
        "alice",
        false
      );
      commitHistoryFixture(
        store.history,
        fixture.doc,
        undo.operationId,
        () => Y.applyUpdate(fixture.doc, update),
        "alice",
        { kind: "undo", target: 1 }
      );
      type("b", Date.now() + minute, "二");
      expect(
        store.history
          .list(fixture.id)
          .map(row => row.kind)
          .reverse()
      ).toEqual(["baseline", "edit", "undo", "edit"]);
    });
  });
});
