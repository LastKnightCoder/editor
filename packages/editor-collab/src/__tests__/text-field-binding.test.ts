import { describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";
import * as Y from "yjs";
import { NodeTree } from "@tau/collaboration";
import { prepareContentContract } from "@tau/db-schema/content-contracts";
import { createTextFieldBinding } from "../textFieldBinding";

async function setup() {
  const original = globalThis.crypto;
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
  try {
    const prepared = await prepareContentContract("example", {
      type: "example.source",
      dataVersion: 1,
      kind: "block",
      isVoid: true,
      collaboration: { textFields: ["source"] },
    });
    const left = new NodeTree(new Y.Doc());
    left.doc.clientID = 100;
    await left.installContracts({ [prepared.id]: prepared.contract }, null);
    left.insertNode(
      {
        type: "example.source",
        collabId: "A",
        tauContract: prepared.id,
        source: "原文",
        children: [{ text: "" }],
      },
      null,
      0,
      null,
      true
    );
    const right = new NodeTree(new Y.Doc());
    right.doc.clientID = 200;
    Y.applyUpdate(right.doc, Y.encodeStateAsUpdate(left.doc));
    const undoLeft = left.createUndoManager({ trackedOrigins: new Set() });
    const undoRight = right.createUndoManager({ trackedOrigins: new Set() });
    let writable = true;
    const a = createTextFieldBinding(left, "A", "source", undoLeft, () => writable);
    const b = createTextFieldBinding(right, "A", "source", undoRight, () => true);
    const exchange = () => {
      const x = Y.encodeStateAsUpdate(left.doc),
        y = Y.encodeStateAsUpdate(right.doc);
      Y.applyUpdate(left.doc, y);
      Y.applyUpdate(right.doc, x);
      expect(left.read()).toEqual(right.read());
    };
    return {
      left,
      right,
      a,
      b,
      exchange,
      readonly: () => {
        writable = false;
      },
      dispose: () => {
        a.dispose();
        b.dispose();
        undoLeft.destroy();
        undoRight.destroy();
        left.doc.destroy();
        right.doc.destroy();
      },
    };
  } finally {
    Object.defineProperty(globalThis, "crypto", { value: original, configurable: true });
  }
}

describe("契约文本字段绑定", () => {
  it("一端撤销删除后，另一端删除标记仍阻止源码句柄写入", async () => {
    const { left, right, a, exchange, dispose } = await setup();
    const leftOrigin = {},
      rightOrigin = {};
    const leftHistory = left.createUndoManager({ trackedOrigins: new Set([leftOrigin]) });
    const rightHistory = right.createUndoManager({ trackedOrigins: new Set([rightOrigin]) });
    try {
      left.removeNode("A", leftOrigin);
      right.removeNode("A", rightOrigin);
      exchange();
      rightHistory.undo();
      exchange();
      expect(() => a.replace("不能复活", a.getSnapshot().revision)).toThrow("失效");
      leftHistory.undo();
      exchange();
      a.replace("恢复后编辑", a.getSnapshot().revision);
      exchange();
      expect(right.textField("A", "source").toString()).toBe("恢复后编辑");
    } finally {
      leftHistory.destroy();
      rightHistory.destroy();
      dispose();
    }
  });

  it("并发增量与移动独立合并，正文投影呈现源码", async () => {
    const { left, right, a, b, exchange, dispose } = await setup();
    try {
      a.edit({ offset: 2, remove: 0, text: "甲", revision: a.getSnapshot().revision });
      b.edit({ offset: 0, remove: 0, text: "乙", revision: b.getSnapshot().revision });
      right.insertNode({ type: "paragraph", children: [{ text: "另块" }] }, null, 1, null);
      right.moveNode("A", null, 1, null);
      exchange();
      expect(a.getSnapshot().value).toBe("乙原文甲");
      expect(left.read()[1].source).toBe("乙原文甲");
      expect(left.properties("A").has("source")).toBe(false);
    } finally {
      dispose();
    }
  });

  it("远端删除也会使旧修订失效，整段替换不能覆盖它", async () => {
    const { a, b, exchange, dispose } = await setup();
    try {
      const previous = a.getSnapshot();
      b.edit({ offset: 0, remove: 1, text: "", revision: b.getSnapshot().revision });
      exchange();
      expect(() => a.replace("旧结果", previous.revision)).toThrow("SOURCE_CONFLICT");
      expect(a.getSnapshot().value).toBe("文");
    } finally {
      dispose();
    }
  });

  it("撤销只撤本地源码增量，保留远端输入", async () => {
    const { a, b, exchange, dispose } = await setup();
    try {
      a.edit({ offset: 2, remove: 0, text: "甲", revision: a.getSnapshot().revision });
      b.edit({ offset: 0, remove: 0, text: "乙", revision: b.getSnapshot().revision });
      exchange();
      a.undo();
      exchange();
      expect(b.getSnapshot().value).toBe("乙原文");
      a.redo();
      exchange();
      expect(b.getSnapshot().value).toBe("乙原文甲");
    } finally {
      dispose();
    }
  });

  it("拒绝普通属性旁路、只读和失效句柄", async () => {
    const { left, a, readonly, dispose } = await setup();
    try {
      expect(() => left.setProperties("A", { source: "旁路" }, null)).toThrow("文本字段");
      readonly();
      expect(() => a.replace("只读", a.getSnapshot().revision)).toThrow("只读");
      a.dispose();
      expect(() => a.replace("迟到", a.getSnapshot().revision)).toThrow("失效");
    } finally {
      dispose();
    }
  });
});
