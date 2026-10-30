import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { Node, Transforms, createEditor } from "slate";
import { NodeTree, createNodeDocument, validateNodeDocument } from "@tau/collaboration";
import {
  prepareContentContract,
  type ContentContractDefinition,
} from "@tau/db-schema/content-contracts";
import { withNodeTree } from "../withNodeTree";

beforeEach(() => vi.stubGlobal("crypto", webcrypto));
afterEach(() => vi.unstubAllGlobals());

async function setup(
  definitions: ContentContractDefinition[] = [
    { type: "header", dataVersion: 1, kind: "block" },
    { type: "paragraph", dataVersion: 1, kind: "block" },
  ]
) {
  const contracts = await Promise.all(
    definitions.map(definition => prepareContentContract("test", definition))
  );
  const identity = { documentId: "merge-test", baselineId: "baseline", epoch: 1 };
  const doc = await createNodeDocument(
    identity,
    {
      title: "",
      bannerBg: "",
      bannerPosition: "center",
      content: contracts.map(({ id }, index) => ({
        type: definitions[index].type,
        collabId: `node-${index}`,
        tauContract: id,
        children: [{ type: "formatted", text: index === 0 ? "甲" : "乙" }],
      })),
    },
    Object.fromEntries(contracts.map(({ id, contract }) => [id, contract]))
  );
  const tree = new NodeTree(doc);
  const origin = {};
  const editor = withNodeTree(createEditor(), tree, origin, {
    normalizeOnConnect: false,
    currentContract: type => contracts.find(({ contract }) => contract.type === type)?.id,
  });
  editor.connectNodeTree();
  const remote = new Y.Doc();
  Y.applyUpdate(remote, Y.encodeStateAsUpdate(doc));
  const remoteTree = new NodeTree(remote);
  return {
    tree,
    editor,
    contracts,
    remoteTree,
    async exchange() {
      const updates = [doc, remote].map(document => Y.encodeStateAsUpdate(document));
      for (const document of [doc, remote])
        for (const update of updates) Y.applyUpdate(document, update);
      await validateNodeDocument(doc, identity);
      await validateNodeDocument(remote, identity);
      expect(tree.read()).toEqual(remoteTree.read());
      expect(editor.children).toEqual(tree.read());
    },
    dispose() {
      editor.disposeNodeTree();
      doc.destroy();
      remote.destroy();
    },
  };
}

describe("跨契约文本合段", () => {
  it.each(["backward", "forward", "range"])(
    "%s 删除可合并标题与段落，保留前块身份、契约和正文",
    async direction => {
      const { tree, editor, contracts, exchange, dispose } = await setup();
      try {
        if (direction === "backward") {
          Transforms.select(editor, { path: [1, 0], offset: 0 });
          editor.deleteBackward("character");
        } else if (direction === "forward") {
          Transforms.select(editor, { path: [0, 0], offset: 1 });
          editor.deleteForward("character");
        } else {
          Transforms.select(editor, {
            anchor: { path: [0, 0], offset: 1 },
            focus: { path: [1, 0], offset: 0 },
          });
          editor.deleteFragment();
        }
        expect(editor.children).toHaveLength(1);
        expect(Node.string(editor)).toBe("甲乙");
        expect(tree.read()[0]).toMatchObject({
          type: "header",
          collabId: "node-0",
          tauContract: contracts[0].id,
        });
        await exchange();
        editor.undo();
        expect(tree.read().map(node => Node.string(node as never))).toEqual(["甲", "乙"]);
        expect(tree.read()[1]).toMatchObject({ type: "paragraph", tauContract: contracts[1].id });
        await exchange();
        editor.redo();
        expect(Node.string(editor)).toBe("甲乙");
        await exchange();
      } finally {
        dispose();
      }
    }
  );

  it("不同类型合段与源段远端输入并发时不丢字，撤销保留远端输入", async () => {
    const { tree, editor, remoteTree, exchange, dispose } = await setup();
    try {
      Transforms.select(editor, { path: [1, 0], offset: 0 });
      editor.deleteBackward("character");
      remoteTree.insertText("node-1", 1, "丙", {});
      await exchange();
      expect(Node.string(editor)).toBe("甲乙丙");
      editor.undo();
      await exchange();
      expect(tree.read().map(node => Node.string(node as never))).toEqual(["甲", "乙丙"]);
    } finally {
      dispose();
    }
  });

  it("两端同时跨契约合段时收敛且不重复正文", async () => {
    const { editor, remoteTree, exchange, dispose } = await setup();
    const other = withNodeTree(createEditor(), remoteTree, {}, { normalizeOnConnect: false });
    other.connectNodeTree();
    try {
      for (const current of [editor, other]) {
        Transforms.select(current, { path: [1, 0], offset: 0 });
        current.deleteBackward("character");
      }
      await exchange();
      expect(Node.string(editor)).toBe("甲乙");
      expect(other.children).toEqual(editor.children);
    } finally {
      other.disposeNodeTree();
      dispose();
    }
  });

  it("同类型不同数据版本不因合段而升级或丢失内容", async () => {
    const { tree, editor, exchange, dispose } = await setup([
      { type: "paragraph", dataVersion: 1, kind: "block" },
      { type: "paragraph", dataVersion: 2, kind: "block" },
    ]);
    try {
      const before = tree.read();
      expect(() => Transforms.mergeNodes(editor, { at: [1] })).not.toThrow();
      expect(tree.read()).toEqual(before);
      expect(editor.children).toEqual(before);
      await exchange();
    } finally {
      dispose();
    }
  });

  it("携带资源声明的不同契约不合并，保留原节点", async () => {
    const { tree, editor, exchange, dispose } = await setup([
      { type: "paragraph", dataVersion: 1, kind: "block" },
      {
        type: "attachment-text",
        dataVersion: 1,
        kind: "block",
        resources: [{ path: "url", kind: "image" }],
      },
    ]);
    try {
      tree.setProperties("node-1", { url: "https://example.test/asset.png" }, null);
      const before = tree.read();
      expect(() => Transforms.mergeNodes(editor, { at: [1] })).not.toThrow();
      expect(tree.read()).toEqual(before);
      expect(editor.children).toEqual(before);
      await exchange();
    } finally {
      dispose();
    }
  });
});
