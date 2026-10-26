import * as Y from "yjs";
import { describe, expect, it } from "vitest";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import { NodeTree } from "./node-tree";
import {
  applyNodeDocumentUpdate,
  createNodeDocument,
  readNodeDocument,
  validateNodeDocument,
} from "./node-document";

const identity = { documentId: "document", baselineId: "baseline", epoch: 1 };
async function setup() {
  const { id, contract } = await prepareContentContract("test", {
    type: "paragraph",
    dataVersion: 1,
    kind: "block",
  });
  const doc = await createNodeDocument(
    identity,
    {
      title: "测试",
      bannerBg: "",
      bannerPosition: "center",
      content: [
        { type: "paragraph", collabId: "A", tauContract: id, children: [{ text: "甲乙" }] },
        { type: "paragraph", collabId: "B", tauContract: id, children: [{ text: "丙" }] },
      ],
    },
    { [id]: contract }
  );
  const fork = new Y.Doc();
  Y.applyUpdate(fork, Y.encodeStateAsUpdate(doc));
  return {
    doc,
    fork,
    tree: new NodeTree(fork),
    contractId: id,
    dispose: () => {
      doc.destroy();
      fork.destroy();
    },
  };
}

describe("节点文档协议与增量准入", () => {
  it("标题保留原有文本增量合并语义", async () => {
    const { doc, fork, dispose } = await setup();
    let accepted: Y.Doc | undefined;
    try {
      doc.getText("title").insert(0, "甲");
      fork.getText("title").insert(2, "乙");
      accepted = await applyNodeDocumentUpdate(doc, Y.encodeStateAsUpdate(fork), identity);
      expect(readNodeDocument(accepted).title).toBe("甲测试乙");
    } finally {
      accepted?.destroy();
      dispose();
    }
  });
  it("空正文的未分配共享根可以经过二进制往返恢复", async () => {
    const doc = await createNodeDocument(
      identity,
      { title: "", bannerBg: "", bannerPosition: "center", content: [] },
      {}
    );
    const restored = new Y.Doc();
    try {
      Y.applyUpdate(restored, Y.encodeStateAsUpdate(doc));
      await validateNodeDocument(restored, identity);
      expect(readNodeDocument(restored).content).toEqual([]);
    } finally {
      doc.destroy();
      restored.destroy();
    }
  });
  it("当前内容入口拒绝旧协议，不创建新根或改写输入", () => {
    const doc = new Y.Doc();
    doc.getMap("meta").set("version", 1);
    try {
      const roots = [...doc.share.keys()],
        before = Y.encodeStateAsUpdate(doc);
      expect(() => readNodeDocument(doc)).toThrow("协议");
      expect([...doc.share.keys()]).toEqual(roots);
      expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
    } finally {
      doc.destroy();
    }
  });
  it("按契约建立净化基线，保存读取后仍可验证", async () => {
    const { doc, dispose } = await setup();
    try {
      await validateNodeDocument(doc, identity);
      expect(readNodeDocument(doc).content[0]).toMatchObject({ collabId: "A" });
    } finally {
      dispose();
    }
  });

  it("拆分、合并与撤销通过结构和稳定身份校验", async () => {
    const { doc, fork, tree, contractId, dispose } = await setup();
    const origin = {},
      history = tree.createUndoManager({ trackedOrigins: new Set([origin]), captureTimeout: 0 });
    let previous = doc;
    try {
      for (const action of [
        () =>
          tree.splitNode(
            "A",
            1,
            { type: "paragraph", collabId: "C", tauContract: contractId, children: [] },
            origin
          ),
        () => tree.mergeNodes("C", "A", origin),
        () => history.undo(),
        () => history.undo(),
        () => history.redo(),
      ]) {
        action();
        const accepted = await applyNodeDocumentUpdate(
          previous,
          Y.encodeStateAsUpdate(fork, Y.encodeStateVector(previous)),
          identity
        );
        expect(readNodeDocument(accepted)).toEqual(readNodeDocument(fork));
        if (previous !== doc) previous.destroy();
        previous = accepted;
      }
    } finally {
      if (previous !== doc) previous.destroy();
      history.destroy();
      dispose();
    }
  });

  it.each(["epoch", "baselineId", "documentId"])("普通增量不能修改 %s", async key => {
    const { doc, fork, dispose } = await setup();
    try {
      fork.getMap("meta").set(key, key === "epoch" ? 2 : "different");
      await expect(
        applyNodeDocumentUpdate(doc, Y.encodeStateAsUpdate(fork), identity)
      ).rejects.toMatchObject({ code: "BASELINE_CONFLICT" });
      expect(doc.getMap("meta").get(key)).toBe(identity[key as keyof typeof identity]);
    } finally {
      dispose();
    }
  });

  it("不接受删除和重建稳定文字根，即使可见 JSON 相同", async () => {
    const { doc, fork, tree, dispose } = await setup();
    try {
      const replacement = new Y.XmlText();
      replacement.insert(0, "甲乙");
      tree.record("A").set("content", replacement);
      await expect(
        applyNodeDocumentUpdate(doc, Y.encodeStateAsUpdate(fork), identity)
      ).rejects.toMatchObject({ code: "CONTENT_IDENTITY_CHANGED" });
    } finally {
      dispose();
    }
  });

  it("缺先行结构的更新不被确认为空提交，补齐后可重试", async () => {
    const { doc, tree, fork, dispose } = await setup();
    const updates: Uint8Array[] = [];
    fork.on("update", (update: Uint8Array) => updates.push(update));
    let accepted: Y.Doc | undefined, final: Y.Doc | undefined;
    try {
      tree.insertText("A", 2, "新增", {});
      tree.insertText("A", 4, "依赖", {});
      await expect(applyNodeDocumentUpdate(doc, updates[1], identity)).rejects.toMatchObject({
        code: "MISSING_DEPENDENCIES",
      });
      expect(readNodeDocument(doc).content[0].children?.[0].text).toBe("甲乙");
      accepted = await applyNodeDocumentUpdate(doc, updates[0], identity);
      final = await applyNodeDocumentUpdate(accepted, updates[1], identity);
      expect(readNodeDocument(final)).toEqual(readNodeDocument(fork));
    } finally {
      accepted?.destroy();
      final?.destroy();
      dispose();
    }
  });

  it("更新不能篡改不可变契约，拒绝后原文档不变", async () => {
    const { doc, tree, fork, contractId, dispose } = await setup();
    try {
      const before = Y.encodeStateAsUpdate(doc);
      tree.contracts.set(contractId, { ...tree.contracts.get(contractId)!, dataVersion: 2 });
      await expect(
        applyNodeDocumentUpdate(doc, Y.encodeStateAsUpdate(fork), identity)
      ).rejects.toThrow();
      expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
    } finally {
      dispose();
    }
  });

  it("节点缺少契约时不能建立新格式文档", async () => {
    await expect(
      createNodeDocument(
        identity,
        {
          title: "",
          bannerBg: "",
          bannerPosition: "center",
          content: [{ type: "paragraph", children: [{ text: "保留" }] }],
        },
        {}
      )
    ).rejects.toMatchObject({ code: "MISSING_CONTRACT" });
  });
});
