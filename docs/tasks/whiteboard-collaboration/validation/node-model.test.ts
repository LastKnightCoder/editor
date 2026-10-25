import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  prepareContentContract,
  type ContentContractDictionary,
} from "@tau/db-schema/content-contracts";
import { NodeTree } from "../../../../packages/collaboration/src/node-tree";
import type { ContentNode } from "../../../../packages/collaboration/src/protocol";

const documents: Y.Doc[] = [];
const histories: Y.UndoManager[] = [];

afterEach(() => {
  histories.splice(0).forEach(history => history.destroy());
  documents.splice(0).forEach(doc => doc.destroy());
});

const paragraph = (id: string): ContentNode => ({
  type: "paragraph",
  collabId: id,
  children: [{ text: id }],
});
const container = (id: string, children: ContentNode[] = []): ContentNode => ({
  type: "blockquote",
  collabId: id,
  children,
});

function createTree(clientId: number): NodeTree {
  const doc = new Y.Doc();
  doc.clientID = clientId;
  documents.push(doc);
  return new NodeTree(doc);
}

async function replicas(
  initial = [container("P", [paragraph("A")]), container("Q"), container("R"), paragraph("B")],
  contracts: ContentContractDictionary = {}
) {
  const base = createTree(100);
  await base.installContracts(contracts, "initial");
  initial.forEach((node, index) => base.insertNode(node, null, index, "initial", true));
  const baseline = Y.encodeStateAsUpdate(base.doc);
  const peers = [200, 300, 400].map(clientId => {
    const tree = createTree(clientId);
    Y.applyUpdate(tree.doc, baseline);
    return tree;
  });
  return { base, peers, baseline };
}

function visibleIds(tree: NodeTree): string[] {
  const result: string[] = [];
  const visit = (nodes: readonly ContentNode[]) => {
    for (const node of nodes) {
      if (typeof node.collabId === "string") result.push(node.collabId);
      visit(node.children ?? []);
    }
  };
  visit(tree.snapshot());
  return result;
}

function exchange(peers: NodeTree[]): void {
  const updates = peers.map(tree => Y.encodeStateAsUpdate(tree.doc));
  peers.forEach(tree => updates.forEach(update => Y.applyUpdate(tree.doc, update)));
  peers.forEach(tree => {
    expect(tree.read()).toEqual(peers[0].read());
    expect(Y.decodeStateVector(Y.encodeStateVector(tree.doc))).toEqual(
      Y.decodeStateVector(Y.encodeStateVector(peers[0].doc))
    );
    const ids = visibleIds(tree);
    expect(new Set(ids).size).toBe(ids.length);
  });
}

function history(tree: NodeTree, origin: object): Y.UndoManager {
  const undo = tree.createUndoManager({
    trackedOrigins: new Set([origin]),
    captureTimeout: 0,
  });
  histories.push(undo);
  return undo;
}

const deliveryOrders = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
] as const;

describe("W1：复用编辑器契约的稳定内容身份", () => {
  it.each(deliveryOrders.map(order => ({ order, label: order.join("→") })))(
    "三端移动/文本/稳定子节点字段在消息顺序 $label 下收敛",
    async ({ order }) => {
      const prepared = await prepareContentContract("example", {
        type: "example.source",
        dataVersion: 1,
        kind: "block",
        collaboration: { textFields: ["source"] },
      });
      const childContract = await prepareContentContract("example", {
        type: "example.settings",
        dataVersion: 1,
        kind: "block",
        collaboration: { textFields: ["tone"] },
      });
      const initial = [
        container("P", [
          {
            ...paragraph("A"),
            type: "example.source",
            tauContract: prepared.id,
            source: "源码",
            children: [
              { text: "A" },
              {
                type: "example.settings",
                collabId: "S",
                tauContract: childContract.id,
                tone: "blue",
                children: [{ text: "" }],
              },
            ],
          },
        ]),
        container("Q"),
        container("R"),
        paragraph("B"),
      ];
      const { peers, baseline } = await replicas(initial, {
        [prepared.id]: prepared.contract,
        [childContract.id]: childContract.contract,
      });
      const updates: Uint8Array[] = [];
      peers.forEach(tree => tree.doc.on("update", update => updates.push(update)));
      peers[0].moveNode("A", "Q", 0, "left");
      peers[1].moveNode("A", "R", 0, "right");
      peers[2].doc.transact(() => {
        peers[2].insertText("A", 1, "远端", "third");
        peers[2].textField("A", "source").insert(2, "增量");
        const tone = peers[2].textField("S", "tone");
        tone.delete(0, tone.length);
        tone.insert(0, "red");
      }, "third");
      expect(updates).toHaveLength(3);

      const receiver = createTree(500);
      Y.applyUpdate(receiver.doc, baseline);
      const record = receiver.record("A");
      const content = receiver.content("A");
      const source = receiver.textField("A", "source");
      const settings = receiver.record("S"),
        tone = receiver.textField("S", "tone");
      const relative = Y.createRelativePositionFromTypeIndex(source, 1);
      for (const index of order) Y.applyUpdate(receiver.doc, updates[index]);
      for (const index of [...order].reverse()) Y.applyUpdate(receiver.doc, updates[index]);
      exchange([...peers, receiver]);

      expect(visibleIds(receiver).sort()).toEqual(["A", "B", "P", "Q", "R", "S"]);
      expect(["Q", "R"]).toContain(receiver.placement("A").parent);
      expect(receiver.record("A")).toBe(record);
      expect(receiver.content("A")).toBe(content);
      expect(receiver.textField("A", "source")).toBe(source);
      expect(receiver.record("S")).toBe(settings);
      expect(receiver.textField("S", "tone")).toBe(tone);
      expect(receiver.placement("S").parent).toBe("A");
      expect(
        content
          .toDelta()
          .filter((part: { insert?: unknown }) => typeof part.insert === "string")
          .map((part: { insert?: unknown }) => part.insert)
          .join("")
      ).toBe("A远端");
      expect(source.toString()).toBe("源码增量");
      expect(tone.toString()).toBe("red");
      expect(receiver.properties("A").has("source")).toBe(false);
      expect(receiver.properties("A").get("tauContract")).toBe(prepared.id);

      const restored = createTree(600);
      Y.applyUpdate(restored.doc, Y.encodeStateAsUpdate(receiver.doc));
      const resolved = Y.createAbsolutePositionFromRelativePosition(relative, restored.doc);
      expect(resolved?.type).toBe(restored.textField("A", "source"));
      expect(resolved?.index).toBe(1);
      expect(restored.read()).toEqual(receiver.read());
    }
  );

  it("移动的撤销/重做不改变内容根，远端文字持续保留", async () => {
    const {
      peers: [left, right],
    } = await replicas();
    const origin = {};
    const undo = history(left, origin);
    const record = left.record("A");
    const content = left.content("A");
    left.moveNode("A", "Q", 0, origin);
    right.insertText("A", 1, "乙", {});
    exchange([left, right]);
    undo.undo();
    exchange([left, right]);
    expect(left.placement("A").parent).toBe("P");
    expect(left.content("A").toString()).toBe("A乙");
    undo.redo();
    exchange([left, right]);
    expect(left.placement("A").parent).toBe("Q");
    expect(left.record("A")).toBe(record);
    expect(left.content("A")).toBe(content);
    expect(content.toString()).toBe("A乙");
  });

  it("远端已接着移动同一节点时，本人撤销/重做不覆盖远端位置", async () => {
    const {
      peers: [left, right],
    } = await replicas();
    const origin = {};
    const undo = history(left, origin);
    left.moveNode("A", "Q", 0, origin);
    exchange([left, right]);
    right.moveNode("A", "R", 0, {});
    exchange([left, right]);
    const placement = structuredClone(left.placement("A"));
    undo.undo();
    exchange([left, right]);
    expect(left.placement("A")).toEqual(placement);
    undo.redo();
    exchange([left, right]);
    expect(left.placement("A")).toEqual(placement);
  });

  it("几何整体与颜色独立竞争，不拼接两个并发几何值", async () => {
    const {
      peers: [left, right, observer],
    } = await replicas();
    const leftGeometry = { x: 10, y: 20, width: 30, height: 40 };
    const rightGeometry = { x: 50, y: 60, width: 70, height: 80 };
    left.setProperties("A", { geometry: leftGeometry }, {});
    right.setProperties("A", { geometry: rightGeometry }, {});
    observer.setProperties("A", { color: "red" }, {});
    exchange([left, right, observer]);
    expect([leftGeometry, rightGeometry]).toContainEqual(left.properties("A").get("geometry"));
    expect(left.properties("A").get("color")).toBe("red");
  });

  it("白板删除可用已观察 ID 集合表达，不改变正文仅删除父节点的语义", async () => {
    const {
      peers: [left, right],
    } = await replicas();
    const observed = ["P", "A"];
    left.doc.transact(
      () => observed.forEach(id => left.removeNode(id, "board-delete")),
      "board-delete"
    );
    right.moveNode("A", null, 4, {});
    exchange([left, right]);
    expect(visibleIds(left)).toEqual(["Q", "R", "B"]);
    expect(left.nodes.has("A")).toBe(true);
    expect(left.content("A").toString()).toBe("A");
  });

  it("删除后撤销显示合并后的远端文字，而不是删除前快照", async () => {
    const {
      peers: [left, right],
    } = await replicas();
    const origin = {};
    const undo = history(left, origin);
    const content = left.content("A");
    left.removeNode("A", origin);
    right.insertText("A", 1, "远端", {});
    exchange([left, right]);
    expect(visibleIds(left)).not.toContain("A");
    undo.undo();
    exchange([left, right]);
    expect(visibleIds(left)).toContain("A");
    expect(left.content("A")).toBe(content);
    expect(content.toString()).toBe("A远端");
  });
});

describe("W1：待满足的删除与历史门槛", () => {
  it.each([0, 1])("双端删除后第 %i 端撤销，另一端的删除仍有效", async first => {
    const {
      peers: [left, right],
    } = await replicas();
    const origins = [{}, {}];
    const trees = [left, right];
    const undo = trees.map((tree, index) => history(tree, origins[index]));
    trees.forEach((tree, index) => tree.removeNode("A", origins[index]));
    exchange(trees);
    undo[first].undo();
    exchange(trees);
    expect(visibleIds(left)).not.toContain("A");
    undo[1 - first].undo();
    exchange(trees);
    expect(visibleIds(left)).toContain("A");
  });

  it("删除观察到的父子树时，并发新增的子节点进入可见恢复投影", async () => {
    const {
      peers: [left, right],
    } = await replicas();
    left.doc.transact(
      () => ["P", "A"].forEach(id => left.removeNode(id, "board-delete")),
      "board-delete"
    );
    right.insertNode(paragraph("new-child"), "P", 1, {}, true);
    exchange([left, right]);
    expect(left.nodes.has("new-child")).toBe(true);
    expect(visibleIds(left)).toContain("new-child");
    expect(visibleIds(left)).not.toContain("P");
  });

  it("撤销创建只隐藏节点，重做仍使用原共享根并保留远端输入", async () => {
    const {
      peers: [left, right],
    } = await replicas();
    const origin = {};
    const undo = history(left, origin);
    left.insertNode(paragraph("new"), null, 4, origin, true);
    const record = left.record("new");
    const content = left.content("new");
    exchange([left, right]);
    right.insertText("new", 3, "远端", {});
    exchange([left, right]);
    undo.undo();
    exchange([left, right]);
    expect(visibleIds(left)).not.toContain("new");
    expect(left.nodes.get("new") === record, "撤销创建必须保留原元素记录").toBe(true);
    expect(left.content("new")).toBe(content);
    undo.redo();
    exchange([left, right]);
    expect(left.nodes.get("new")).toBe(record);
    expect(left.content("new")).toBe(content);
    expect(content.toString()).toBe("new远端");
  });

  it("在循环恢复区外移动普通节点，不隐式修复其它节点的父关系", async () => {
    const {
      peers: [left, right],
    } = await replicas([container("A"), container("B"), paragraph("C"), paragraph("D")]);
    left.moveNode("A", "B", 0, {});
    right.moveNode("B", "A", 0, {});
    exchange([left, right]);
    const before = {
      a: structuredClone(left.placement("A")),
      b: structuredClone(left.placement("B")),
    };
    left.moveNode("C", null, 1, {});
    exchange([left, right]);
    expect({ a: left.placement("A"), b: left.placement("B") }).toEqual(before);
  });
});
