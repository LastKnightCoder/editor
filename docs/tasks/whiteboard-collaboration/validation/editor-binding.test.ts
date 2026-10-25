import { afterEach, describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import * as Y from "yjs";
import { createEditor, Element, Node, Transforms } from "slate";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import { NodeTree } from "../../../../packages/collaboration/src/node-tree";
import { withNodeTree } from "../../../../packages/editor-collab/src/withNodeTree";

const cleanups: (() => void)[] = [];
afterEach(() =>
  cleanups
    .splice(0)
    .reverse()
    .forEach(dispose => dispose())
);

async function replicas() {
  const previousCrypto = globalThis.crypto;
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
  cleanups.push(() =>
    Object.defineProperty(globalThis, "crypto", {
      value: previousCrypto,
      configurable: true,
    })
  );
  const prepared = await prepareContentContract("example", {
    type: "example.source",
    kind: "block",
    dataVersion: 1,
    collaboration: { textFields: ["source"] },
  });
  const original = new NodeTree(new Y.Doc());
  cleanups.push(() => original.doc.destroy());
  original.doc.clientID = 100;
  await original.installContracts({ [prepared.id]: prepared.contract }, "initial");
  original.insertNode(
    {
      type: "example.source",
      collabId: "A",
      tauContract: prepared.id,
      source: "源码",
      children: [{ type: "formatted", text: "正文" }],
    },
    null,
    0,
    "initial",
    true
  );
  original.insertNode(
    {
      type: "paragraph",
      collabId: "B",
      children: [{ type: "formatted", text: "B" }],
    },
    null,
    1,
    "initial",
    true
  );
  const peers = [200, 300].map(clientId => {
    const tree = new NodeTree(new Y.Doc());
    tree.doc.clientID = clientId;
    Y.applyUpdate(tree.doc, Y.encodeStateAsUpdate(original.doc));
    const editor = withNodeTree(createEditor(), tree, {});
    editor.connectNodeTree();
    cleanups.push(() => {
      editor.disconnectNodeTree();
      editor.undoManager.destroy();
      tree.doc.destroy();
    });
    return { tree, editor };
  });
  const exchange = () => {
    const updates = peers.map(({ tree }) => Y.encodeStateAsUpdate(tree.doc));
    peers.forEach(({ tree }) => updates.forEach(update => Y.applyUpdate(tree.doc, update)));
    expect(peers[0].tree.read()).toEqual(peers[1].tree.read());
    expect(peers[0].editor.children).toEqual(peers[0].tree.read());
    expect(peers[1].editor.children).toEqual(peers[1].tree.read());
  };
  return { left: peers[0], right: peers[1], exchange };
}

describe("W1：实际编辑器绑定与节点契约对齐", () => {
  it("画布式移动和契约源码编辑共用历史，撤销保留另一端输入", async () => {
    const { left, right, exchange } = await replicas();
    const local = left.editor.openNodeTextField(left.editor.children[0] as Element, "source");
    const remote = right.editor.openNodeTextField(right.editor.children[0] as Element, "source");
    const root = left.tree.textField("A", "source");
    Transforms.moveNodes(left.editor, { at: [0], to: [1] });
    left.editor.undoManager.stopCapturing();
    local.edit({ offset: 2, remove: 0, text: "甲", revision: local.getSnapshot().revision });
    remote.edit({ offset: 2, remove: 0, text: "乙", revision: remote.getSnapshot().revision });
    exchange();
    local.undo();
    exchange();
    expect(local.getSnapshot().value).toBe("源码乙");
    expect(left.editor.children[1]).toMatchObject({ collabId: "A" });
    left.editor.undo();
    exchange();
    expect(left.editor.children[0]).toMatchObject({ collabId: "A", source: "源码乙" });
    left.editor.redo();
    local.redo();
    exchange();
    expect(left.editor.children[1]).toMatchObject({ collabId: "A", source: "源码甲乙" });
    expect(left.tree.textField("A", "source")).toBe(root);
  });

  it("源码字段与正文修改不进入另一个编辑视图的撤销历史", async () => {
    const { left, right, exchange } = await replicas();
    const remote = right.editor.openNodeTextField(right.editor.children[0] as Element, "source");
    Transforms.insertText(left.editor, "甲", { at: { path: [0, 0], offset: 2 } });
    remote.edit({ offset: 2, remove: 0, text: "乙", revision: remote.getSnapshot().revision });
    exchange();
    left.editor.undo();
    exchange();
    expect(Node.string(left.editor.children[0])).toBe("正文");
    expect(left.tree.textField("A", "source").toString()).toBe("源码乙");
    right.editor.undo();
    exchange();
    expect(left.tree.textField("A", "source").toString()).toBe("源码");
  });

  it("编辑器双端删除后，仅撤销其中一端不应复活节点", async () => {
    const { left, right, exchange } = await replicas();
    Transforms.removeNodes(left.editor, { at: [0] });
    Transforms.removeNodes(right.editor, { at: [0] });
    exchange();
    right.editor.undo();
    exchange();
    expect(
      left.editor.children.map(node => ("collabId" in node ? node.collabId : null))
    ).not.toContain("A");
  });

  it("编辑器撤销创建后，仍保留能承接远端编辑的共享根", async () => {
    const { left, right, exchange } = await replicas();
    Transforms.insertNodes(
      left.editor,
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "新增" }],
      },
      { at: [2] }
    );
    const inserted = left.editor.children[2] as Element & { collabId: string };
    const record = left.tree.record(inserted.collabId);
    const content = left.tree.content(inserted.collabId);
    exchange();
    Transforms.insertText(right.editor, "远端", { at: { path: [2, 0], offset: 2 } });
    exchange();
    left.editor.undo();
    exchange();
    expect(
      left.tree.nodes.get(inserted.collabId) === record,
      "实际编辑器撤销也必须保留原元素记录"
    ).toBe(true);
    left.editor.redo();
    exchange();
    expect(left.tree.content(inserted.collabId)).toBe(content);
    expect(Node.string(left.editor.children[2])).toBe("新增远端");
  });
});
