import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { NodeTree } from "./node-tree";
import { NodeTreeHistory } from "./node-tree-history";
import { NODE_TREE_LIMITS } from "./model-limits";
import { prepareContentContract } from "@tau/db-schema/content-contracts";

const disposers: (() => void)[] = [];
afterEach(() =>
  disposers
    .splice(0)
    .reverse()
    .forEach(dispose => dispose())
);
function document() {
  const doc = new Y.Doc();
  disposers.push(() => doc.destroy());
  return doc;
}
function seed(tree: NodeTree, value: string) {
  tree.insertNode(
    { type: "paragraph", collabId: "same-id", children: [{ text: value }] },
    null,
    0,
    "initial",
    true
  );
}

describe("多富文本根与宿主历史", () => {
  it("同一文档中的同名节点隔离，共享契约字典，作用域不依赖打开顺序", async () => {
    const doc = document();
    const first = new NodeTree(doc, { rootId: "root-a" });
    const second = new NodeTree(doc, { rootId: "root-b" });
    const contract = await prepareContentContract("example", {
      type: "example.source",
      dataVersion: 1,
      kind: "block",
      collaboration: { textFields: ["source"] },
    });
    await first.installContracts({ [contract.id]: contract.contract }, "initial");
    for (const [tree, source] of [
      [first, "甲"],
      [second, "乙"],
    ] as const)
      tree.insertNode(
        {
          type: "example.source",
          collabId: "same-id",
          tauContract: contract.id,
          source,
          children: [{ text: "" }],
        },
        null,
        0,
        "initial",
        true
      );
    expect(first.contracts).toBe(second.contracts);
    expect(first.nodes).not.toBe(second.nodes);
    first.textField("same-id", "source").insert(1, "改");
    expect(second.textField("same-id", "source").toString()).toBe("乙");
    const relative = Y.createRelativePositionFromTypeIndex(first.textField("same-id", "source"), 1);
    const restored = document();
    Y.applyUpdate(restored, Y.encodeStateAsUpdate(doc));
    const restoredSecond = new NodeTree(restored, { rootId: "root-b" });
    const restoredFirst = new NodeTree(restored, { rootId: "root-a" });
    expect(restoredFirst.read()).toEqual(first.read());
    expect(restoredSecond.read()).toEqual(second.read());
    expect(Y.createAbsolutePositionFromRelativePosition(relative, restored)?.type).toBe(
      restoredFirst.textField("same-id", "source")
    );
    expect(restoredFirst.contracts).toBe(restoredSecond.contracts);
  });

  it("宿主跨根维护一条时间顺序历史，另一视图输入不被撤销", () => {
    const doc = document();
    const first = new NodeTree(doc, { rootId: "a" });
    const second = new NodeTree(doc, { rootId: "b" });
    seed(first, "甲");
    seed(second, "乙");
    const local = {},
      remote = {};
    const history = first.createUndoManager({
      trackedOrigins: new Set([local]),
      captureTimeout: 0,
    });
    second.attachUndoManager(history);
    const other = second.createUndoManager({ trackedOrigins: new Set([remote]) });
    disposers.push(() => {
      history.destroy();
      other.destroy();
    });
    first.insertText("same-id", 1, "一", local);
    second.insertText("same-id", 1, "二", local);
    second.insertText("same-id", 2, "远端", remote);
    history.undo();
    expect(first.content("same-id").toString()).toBe("甲一");
    expect(second.content("same-id").toString()).toBe("乙远端");
    history.undo();
    expect(first.content("same-id").toString()).toBe("甲");
    other.undo();
    expect(second.content("same-id").toString()).toBe("乙");
    history.redo();
    history.redo();
    expect(first.content("same-id").toString()).toBe("甲一");
    expect(second.content("same-id").toString()).toBe("乙二");
  });

  it("后挂入的根不追溯吸收此前同事务但不在历史作用域内的编辑", () => {
    const doc = document(),
      origin = {};
    const first = new NodeTree(doc, { rootId: "a" }),
      second = new NodeTree(doc, { rootId: "b" });
    seed(first, "甲");
    seed(second, "乙");
    const history = first.createUndoManager({ trackedOrigins: new Set([origin]) });
    disposers.push(() => history.destroy());
    doc.transact(() => {
      first.insertText("same-id", 1, "应撤销", origin);
      second.insertText("same-id", 1, "不应撤销", origin);
    }, origin);
    second.attachUndoManager(history);
    history.undo();
    expect(first.content("same-id").toString()).toBe("甲");
    expect(second.content("same-id").toString()).toBe("乙不应撤销");
  });

  it("跨根复合创建一次撤销不删除记录，远端编辑仍保留", () => {
    const doc = document(),
      origin = {};
    const first = new NodeTree(doc, { rootId: "a" }),
      second = new NodeTree(doc, { rootId: "b" });
    const history = first.createUndoManager({ trackedOrigins: new Set([origin]) });
    second.attachUndoManager(history);
    disposers.push(() => history.destroy());
    doc.transact(() => {
      first.insertNode(
        { type: "paragraph", collabId: "A", children: [{ text: "甲" }] },
        null,
        0,
        origin,
        true
      );
      second.insertNode(
        { type: "paragraph", collabId: "B", children: [{ text: "乙" }] },
        null,
        0,
        origin,
        true
      );
    }, origin);
    const a = first.record("A"),
      b = second.record("B");
    second.insertText("B", 1, "远端", {});
    expect(history.undoStack).toHaveLength(1);
    history.undo();
    expect(first.read()).toEqual([]);
    expect(second.read()).toEqual([]);
    expect(first.record("A")).toBe(a);
    expect(second.record("B")).toBe(b);
    history.redo();
    expect(second.content("B").toString()).toBe("乙远端");
  });

  it("释放一个根只清理订阅，不销毁数据、另一根或宿主历史", () => {
    const doc = document(),
      origin = {};
    const first = new NodeTree(doc, { rootId: "a" }),
      second = new NodeTree(doc, { rootId: "b" });
    seed(first, "甲");
    seed(second, "乙");
    const history = first.createUndoManager({ trackedOrigins: new Set([origin]) });
    second.attachUndoManager(history);
    disposers.push(() => history.destroy());
    first.insertText("same-id", 1, "修改", origin);
    const content = first.content("same-id");
    first.dispose();
    first.dispose();
    expect(() => first.read()).toThrow("已释放");
    expect(history.isDisposed).toBe(false);
    history.undo();
    const reopened = new NodeTree(doc, { rootId: "a" });
    expect(reopened.content("same-id")).toBe(content);
    expect(content.toString()).toBe("甲");
    second.insertText("same-id", 1, "继续", origin);
    expect(second.content("same-id").toString()).toBe("乙继续");
  });

  it("拒绝跨文档、普通或已销毁的历史，失败不写数据", () => {
    const first = new NodeTree(document()),
      second = new NodeTree(document());
    const history = first.createUndoManager({ trackedOrigins: new Set() });
    const before = Y.encodeStateAsUpdate(second.doc);
    expect(
      () => new NodeTreeHistory([first.nodes, second.nodes], { trackedOrigins: new Set() })
    ).toThrow("同一份");
    expect(() => new NodeTreeHistory(first.doc, { trackedOrigins: new Set() })).toThrow("显式");
    expect(() => second.attachUndoManager(history)).toThrow("另一份");
    const raw = new Y.UndoManager(first.nodes);
    expect(() => first.attachUndoManager(raw as typeof history)).toThrow("公共历史");
    raw.destroy();
    history.destroy();
    expect(() => first.attachUndoManager(history)).toThrow("已释放");
    expect(Y.encodeStateAsUpdate(second.doc)).toEqual(before);
  });

  it("根 ID 和根数量预算在分配前检查，重开原根不重复计数", () => {
    const doc = document();
    for (const rootId of [
      "",
      "a:b",
      "../a",
      "a b",
      "a".repeat(NODE_TREE_LIMITS.rootIdLength + 1),
    ]) {
      expect(() => new NodeTree(doc, { rootId })).toThrow("作用域");
      expect(doc.share.size).toBe(0);
    }
    const roots = Array.from(
      { length: NODE_TREE_LIMITS.roots },
      (_, index) => new NodeTree(doc, { rootId: `r${index}` })
    );
    const size = doc.share.size;
    expect(() => new NodeTree(doc, { rootId: "overflow" })).toThrow("预算");
    expect(doc.share.size).toBe(size);
    expect(new NodeTree(doc, { rootId: "r0" }).nodes).toBe(roots[0].nodes);
    roots.forEach(tree => tree.dispose());
  });
});
