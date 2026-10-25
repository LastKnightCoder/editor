import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { NodeTree } from "./node-tree";
import type { ContentNode } from "./protocol";

const cleanups: (() => void)[] = [];
afterEach(() =>
  cleanups
    .splice(0)
    .reverse()
    .forEach(dispose => dispose())
);

const paragraph = (id: string, text = id): ContentNode => ({
  type: "paragraph",
  collabId: id,
  children: [{ text }],
});
const container = (id: string, children: ContentNode[] = []): ContentNode => ({
  type: "blockquote",
  collabId: id,
  children,
});
const visibleIds = (tree: NodeTree): string[] => {
  const visit = (nodes: readonly ContentNode[]): string[] =>
    nodes.flatMap(node => [
      ...(typeof node.collabId === "string" ? [node.collabId] : []),
      ...visit(node.children ?? []),
    ]);
  return visit(tree.snapshot());
};

function setup(initial = [paragraph("B")]) {
  const base = new NodeTree(new Y.Doc());
  base.doc.clientID = 100;
  initial.forEach((node, index) => base.insertNode(node, null, index, "initial", true));
  const peers = [200, 300].map(client => {
    const tree = new NodeTree(new Y.Doc());
    tree.doc.clientID = client;
    Y.applyUpdate(tree.doc, Y.encodeStateAsUpdate(base.doc));
    const origin = {};
    const history = tree.createUndoManager({
      trackedOrigins: new Set([origin]),
      captureTimeout: 0,
    });
    cleanups.push(() => {
      history.destroy();
      tree.doc.destroy();
    });
    return { tree, origin, history };
  });
  cleanups.push(() => base.doc.destroy());
  const exchange = () => {
    const updates = peers.map(peer => Y.encodeStateAsUpdate(peer.tree.doc));
    peers.forEach(peer => updates.forEach(update => Y.applyUpdate(peer.tree.doc, update)));
    expect(peers[0].tree.read()).toEqual(peers[1].tree.read());
  };
  return { left: peers[0], right: peers[1], exchange };
}

describe("节点池的创建、删除和恢复历史", () => {
  it("创建只发一个完整更新，撤销后晚到的远端文字仍回到原根", () => {
    const { left, right, exchange } = setup();
    const updates: Uint8Array[] = [];
    const capture = (update: Uint8Array) => updates.push(update);
    left.tree.doc.on("update", capture);
    left.tree.insertNode(paragraph("A"), null, 1, left.origin, true);
    left.tree.doc.off("update", capture);
    expect(updates).toHaveLength(1);
    Y.applyUpdate(right.tree.doc, updates[0]);
    expect(visibleIds(right.tree)).toEqual(["B", "A"]);
    expect(right.tree.content("A").toString()).toBe("A");
    const record = left.tree.record("A");
    const content = left.tree.content("A");
    right.tree.insertText("A", 1, "迟到", right.origin);
    const delayed = Y.encodeStateAsUpdate(right.tree.doc);
    left.history.undo();
    expect(left.tree.isDeleted("A")).toBe(true);
    Y.applyUpdate(left.tree.doc, delayed);
    expect(left.tree.record("A")).toBe(record);
    expect(left.tree.content("A")).toBe(content);
    expect(content.toString()).toBe("A迟到");
    expect(visibleIds(left.tree)).toEqual(["B"]);
    left.history.redo();
    exchange();
    expect(visibleIds(left.tree)).toEqual(["B", "A"]);
    expect(left.tree.content("A")).toBe(content);
    expect(content.toString()).toBe("A迟到");
  });

  it("同一事务中创建多棵子树和编辑旧节点，撤销/重做不改变初始化身份", () => {
    const { left, right, exchange } = setup();
    left.tree.doc.transact(() => {
      left.tree.setProperties("B", { color: "red" }, left.origin);
      left.tree.insertNode(container("P", [paragraph("A")]), null, 1, left.origin, true);
      left.tree.insertNode(paragraph("C"), null, 2, left.origin, true);
    }, left.origin);
    const roots = ["P", "A", "C"].map(id => left.tree.record(id));
    expect(left.history.undoStack).toHaveLength(1);
    exchange();
    right.tree.insertText("A", 1, "远端", right.origin);
    exchange();
    left.history.undo();
    exchange();
    expect(visibleIds(left.tree)).toEqual(["B"]);
    expect(left.tree.properties("B").has("color")).toBe(false);
    ["P", "A", "C"].forEach((id, index) => expect(left.tree.record(id)).toBe(roots[index]));
    left.history.redo();
    exchange();
    expect(visibleIds(left.tree)).toEqual(["B", "P", "A", "C"]);
    expect(left.tree.properties("B").get("color")).toBe("red");
    expect(left.tree.content("A").toString()).toBe("A远端");
  });

  it("跨事务合并一个撤销步时，初始化区间不会吃掉后来编辑的历史", () => {
    const { left, exchange } = setup();
    left.history.captureTimeout = 60_000;
    left.tree.insertNode(paragraph("A"), null, 1, left.origin, true);
    const record = left.tree.record("A");
    left.tree.insertText("A", 1, "追加", left.origin);
    left.tree.setProperties("B", { color: "red" }, left.origin);
    expect(left.history.undoStack).toHaveLength(1);
    left.history.undo();
    exchange();
    expect(visibleIds(left.tree)).toEqual(["B"]);
    expect(left.tree.record("A")).toBe(record);
    expect(left.tree.properties("B").has("color")).toBe(false);
    left.history.redo();
    exchange();
    expect(left.tree.content("A").toString()).toBe("A追加");
    expect(left.tree.properties("B").get("color")).toBe("red");
  });

  it.each([0, 1])("双删按顺序 %i 撤销后，再重做任一删除仍不可见", first => {
    const { left, right, exchange } = setup([paragraph("A"), paragraph("B")]);
    const peers = [left, right];
    peers.forEach(peer => peer.tree.removeNode("A", peer.origin));
    exchange();
    peers[first].history.undo();
    exchange();
    expect(visibleIds(left.tree)).toEqual(["B"]);
    peers[1 - first].history.undo();
    exchange();
    expect(visibleIds(left.tree)).toEqual(["A", "B"]);
    peers[first].history.redo();
    exchange();
    expect(visibleIds(left.tree)).toEqual(["B"]);
    peers[1 - first].history.redo();
    exchange();
    peers[first].history.undo();
    exchange();
    expect(visibleIds(left.tree)).toEqual(["B"]);
  });

  it("创建的重做不撤掉另一端的删除意图", () => {
    const { left, right, exchange } = setup();
    left.tree.insertNode(paragraph("A"), null, 1, left.origin, true);
    const content = left.tree.content("A");
    exchange();
    right.tree.removeNode("A", right.origin);
    exchange();
    left.history.undo();
    exchange();
    left.history.redo();
    exchange();
    expect(visibleIds(left.tree)).toEqual(["B"]);
    expect(left.tree.content("A")).toBe(content);
    right.history.undo();
    exchange();
    expect(visibleIds(left.tree)).toEqual(["B", "A"]);
  });

  it("父创建被撤销时，另一端后来创建的子树可恢复且读取不改写原关系", () => {
    const { left, right, exchange } = setup();
    left.tree.insertNode(container("P"), null, 1, left.origin, true);
    exchange();
    right.tree.insertNode(container("C", [paragraph("A")]), "P", 0, right.origin, true);
    exchange();
    left.history.undo();
    exchange();
    const state = Y.encodeStateAsUpdate(left.tree.doc);
    expect(visibleIds(left.tree)).toEqual(["B", "C", "A"]);
    expect(left.tree.placement("C").parent).toBe("P");
    expect(Y.encodeStateAsUpdate(left.tree.doc)).toEqual(state);
    left.history.redo();
    exchange();
    expect(visibleIds(left.tree)).toEqual(["B", "P", "C", "A"]);
  });

  it("观察集合校验失败零写入，成功删除后撤销/重做仅影响该集合", () => {
    const { left, right, exchange } = setup([container("P", [paragraph("A")]), paragraph("B")]);
    const before = Y.encodeStateAsUpdate(left.tree.doc);
    expect(() => left.tree.removeNodes(["P", "missing"], left.origin)).toThrow();
    expect(Y.encodeStateAsUpdate(left.tree.doc)).toEqual(before);
    left.tree.removeNodes(["P", "A"], left.origin);
    right.tree.insertNode(paragraph("C"), "P", 1, right.origin, true);
    exchange();
    expect(visibleIds(left.tree)).toEqual(["B", "C"]);
    left.history.undo();
    exchange();
    expect(visibleIds(left.tree)).toEqual(["P", "A", "C", "B"]);
    left.history.redo();
    exchange();
    expect(visibleIds(left.tree)).toEqual(["B", "C"]);
  });

  it("显式放到恢复节点之后只物化需要的锚点，移动可撤销", () => {
    const { left, right, exchange } = setup([
      container("A"),
      container("B"),
      paragraph("C"),
      paragraph("D"),
    ]);
    left.tree.moveNode("A", "B", 0, "setup");
    right.tree.moveNode("B", "A", 0, "setup");
    exchange();
    expect(visibleIds(left.tree)).toEqual(["C", "D", "A", "B"]);
    const before = left.tree.read();
    left.tree.moveNode("C", null, 2, left.origin);
    exchange();
    expect(visibleIds(left.tree)).toEqual(["D", "A", "B", "C"]);
    left.history.undo();
    exchange();
    expect(left.tree.read()).toEqual(before);
  });
});
