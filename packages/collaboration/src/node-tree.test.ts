import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { NodeTree } from "./node-tree";
import type { ContentNode } from "./protocol";

const paragraph = (id: string, text = id): ContentNode => ({
  type: "paragraph",
  collabId: id,
  children: [{ text }],
});
const ids = (tree: NodeTree) => tree.read().map(node => node.collabId);
const body = (tree: NodeTree, id: string) => {
  const visit = (nodes: ContentNode[]): ContentNode | undefined => {
    for (const node of nodes) {
      if (node.collabId === id) return node;
      const nested = visit(node.children ?? []);
      if (nested) return nested;
    }
  };
  return visit(tree.read())
    ?.children?.map(node => node.text ?? "")
    .join("");
};

function setup(initial = [paragraph("A"), paragraph("B"), paragraph("C")]) {
  const base = new NodeTree(new Y.Doc());
  base.doc.clientID = 100;
  initial.forEach((node, index) => base.insertNode(node, null, index, "initial", true));
  const fork = (id: number) => {
    const tree = new NodeTree(new Y.Doc());
    tree.doc.clientID = id;
    Y.applyUpdate(tree.doc, Y.encodeStateAsUpdate(base.doc));
    return tree;
  };
  const left = fork(200),
    right = fork(300);
  const exchange = () => {
    const a = Y.encodeStateAsUpdate(left.doc),
      b = Y.encodeStateAsUpdate(right.doc);
    Y.applyUpdate(left.doc, b);
    Y.applyUpdate(right.doc, a);
    expect(left.read()).toEqual(right.read());
  };
  const dispose = () => [base, left, right].forEach(tree => tree.doc.destroy());
  return { base, left, right, exchange, dispose };
}

describe("稳定节点身份与位置引用", () => {
  it("双端移动同一块只保留一个位置，同时保留两端文本编辑", () => {
    const { left, right, exchange, dispose } = setup();
    try {
      const content = left.content("A");
      left.moveNode("A", null, 2, "left");
      right.moveNode("A", null, 1, "right");
      left.insertText("A", 1, "甲", "left");
      right.insertText("A", 1, "乙", "right");
      exchange();
      expect(ids(left).filter(id => id === "A")).toHaveLength(1);
      expect(body(left, "A")).toContain("甲");
      expect(body(left, "A")).toContain("乙");
      expect(left.content("A")).toBe(content);
      exchange();
      expect(ids(left).filter(id => id === "A")).toHaveLength(1);
    } finally {
      dispose();
    }
  });

  it("移动不使另一端对原文本的编辑失效", () => {
    const { left, right, exchange, dispose } = setup();
    try {
      left.moveNode("A", null, 2, "left");
      left.insertText("A", 1, "甲", "left");
      right.insertText("A", 1, "乙", "right");
      exchange();
      expect(ids(left)).toEqual(["B", "C", "A"]);
      expect(body(left, "A")).toBe("A甲乙");
    } finally {
      dispose();
    }
  });

  it("跨父节点移动保留后代的文本、标记及并发属性", () => {
    const { left, right, exchange, dispose } = setup([
      { type: "blockquote", collabId: "P", children: [paragraph("A", "正文")] },
      { type: "blockquote", collabId: "Q", children: [paragraph("B")] },
    ]);
    try {
      const content = left.content("A");
      left.moveNode("A", "Q", 1, "left");
      right.insertText("A", 2, "标记", "right", { bold: true });
      right.setProperties("A", { custom: { value: 7 } }, "right");
      exchange();
      expect(left.read()[0].children).toEqual([{ type: "formatted", text: "" }]);
      expect(left.read()[1].children?.[1]).toMatchObject({
        collabId: "A",
        custom: { value: 7 },
        children: [{ text: "正文" }, { text: "标记", bold: true }],
      });
      expect(left.content("A")).toBe(content);
    } finally {
      dispose();
    }
  });

  it("并发形成父子环时确定性恢复到根部，不丢节点或改写共享状态", () => {
    const { left, right, exchange, dispose } = setup([
      { type: "blockquote", collabId: "A", children: [] },
      { type: "blockquote", collabId: "B", children: [] },
    ]);
    try {
      left.moveNode("A", "B", 0, "left");
      right.moveNode("B", "A", 0, "right");
      exchange();
      const before = Y.encodeStateAsUpdate(left.doc);
      expect(ids(left)).toEqual(["A"]);
      expect(left.read()[0].children?.[0].collabId).toBe("B");
      expect(Y.encodeStateAsUpdate(left.doc)).toEqual(before);
    } finally {
      dispose();
    }
  });

  it("删除与移动同一节点并发时删除生效，但不会删除仍可撤销的内容", () => {
    const { left, right, exchange, dispose } = setup();
    try {
      left.moveNode("A", null, 2, "left");
      right.removeNode("A", "right");
      exchange();
      expect(ids(left)).toEqual(["B", "C"]);
      expect(left.content("A").toString()).toBe("A");
    } finally {
      dispose();
    }
  });

  it("子节点移出与删除原父节点并发时保留已移出的子节点", () => {
    const { left, right, exchange, dispose } = setup([
      { type: "blockquote", collabId: "P", children: [paragraph("A")] },
      paragraph("B"),
    ]);
    try {
      left.moveNode("A", null, 2, "left");
      right.removeNode("P", "right");
      exchange();
      expect(ids(left)).toEqual(["B", "A"]);
    } finally {
      dispose();
    }
  });

  it("撤销移动保留远端文本修改，重做不复制内容", () => {
    const { left, right, exchange, dispose } = setup();
    const origin = {};
    const undo = left.createUndoManager({ trackedOrigins: new Set([origin]) });
    try {
      left.moveNode("A", null, 2, origin);
      right.insertText("A", 1, "远端", "right");
      exchange();
      undo.undo();
      exchange();
      expect(ids(left)).toEqual(["A", "B", "C"]);
      expect(body(left, "A")).toBe("A远端");
      undo.redo();
      exchange();
      expect(ids(left)).toEqual(["B", "C", "A"]);
      expect(body(left, "A")).toBe("A远端");
    } finally {
      undo.destroy();
      dispose();
    }
  });

  it("复制节点分配新身份，修改副本不影响原节点", () => {
    const { left, dispose } = setup();
    try {
      const copied = left.insertNode(left.read()[0], null, 1, "copy");
      expect(copied).not.toBe("A");
      left.insertText(copied, 1, "副本", "copy");
      expect(body(left, "A")).toBe("A");
      expect(body(left, copied)).toBe("A副本");
    } finally {
      dispose();
    }
  });

  it("编码持久化后恢复相同位置和全部编辑", () => {
    const { left, right, exchange, dispose } = setup();
    const restored = new NodeTree(new Y.Doc());
    try {
      left.moveNode("A", null, 2, "left");
      right.insertText("A", 1, "远端", "right");
      exchange();
      Y.applyUpdate(restored.doc, Y.encodeStateAsUpdate(left.doc));
      expect(restored.read()).toEqual(left.read());
    } finally {
      restored.doc.destroy();
      dispose();
    }
  });

  it("拒绝非法移动和输入，失败前不产生部分写入", () => {
    const { left, dispose } = setup([
      { type: "blockquote", collabId: "P", children: [paragraph("A")] },
    ]);
    try {
      const before = Y.encodeStateAsUpdate(left.doc);
      expect(() => left.moveNode("P", "A", 0, null)).toThrow();
      expect(() => left.moveNode("A", null, 100, null)).toThrow();
      expect(() =>
        left.insertNode({ type: "paragraph", children: [], bad: NaN }, null, 0, null)
      ).toThrow();
      expect(Y.encodeStateAsUpdate(left.doc)).toEqual(before);
    } finally {
      dispose();
    }
  });

  it("同一事务内连续操作读取最新位置和文本", () => {
    const { left, dispose } = setup();
    try {
      left.doc.transact(() => {
        left.moveNode("A", null, 2, "batch");
        expect(ids(left)).toEqual(["B", "C", "A"]);
        left.moveNode("B", null, 2, "batch");
        left.insertText("A", 1, "甲", "batch");
        expect(body(left, "A")).toBe("A甲");
      }, "batch");
      expect(ids(left)).toEqual(["C", "A", "B"]);
    } finally {
      dispose();
    }
  });

  it("未变化子树快照复用，公开可写读取不污染缓存", () => {
    const { left, dispose } = setup();
    try {
      const first = left.snapshot();
      const writable = left.read();
      writable[0].type = "changed";
      left.insertText("A", 1, "甲", "local");
      const next = left.snapshot();
      expect(next[1]).toBe(first[1]);
      expect(next[0]).not.toBe(first[0]);
      expect(next[0].type).toBe("paragraph");
      expect(Object.isFrozen(next[0].children)).toBe(true);
    } finally {
      dispose();
    }
  });

  it("循环恢复投影中的用户移动可落成正常树", () => {
    const { left, right, exchange, dispose } = setup([
      { type: "blockquote", collabId: "A", children: [] },
      { type: "blockquote", collabId: "B", children: [] },
    ]);
    try {
      left.moveNode("A", "B", 0, "left");
      right.moveNode("B", "A", 0, "right");
      exchange();
      left.moveNode("B", null, 1, "left");
      exchange();
      expect(ids(left)).toEqual(["A", "B"]);
    } finally {
      dispose();
    }
  });

  it("空文本的格式可保存、修改，并在输入时沿用", () => {
    const { left, right, exchange, dispose } = setup([
      { type: "paragraph", collabId: "A", children: [{ text: "", bold: true }] },
    ]);
    try {
      expect(left.read()[0].children?.[0]).toMatchObject({ text: "", bold: true });
      left.formatText("A", 0, 0, { bold: null, italic: true }, "left");
      exchange();
      expect(right.read()[0].children?.[0]).toEqual({ type: "formatted", text: "", italic: true });
      right.insertText("A", 0, "文字", "right");
      exchange();
      expect(left.read()[0].children?.[0]).toMatchObject({ text: "文字", italic: true });
    } finally {
      dispose();
    }
  });
});
