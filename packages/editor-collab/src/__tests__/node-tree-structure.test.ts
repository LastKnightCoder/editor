import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Editor, Node, Transforms, createEditor } from "slate";
import { NodeTree } from "@tau/collaboration";
import { withNodeTree } from "../withNodeTree";

function setup(texts: string[]) {
  const base = new NodeTree(new Y.Doc());
  base.doc.clientID = 100;
  texts.forEach((text, index) =>
    base.insertNode(
      {
        type: "paragraph",
        collabId: `node-${index}`,
        children: [{ type: "formatted", text }],
      },
      null,
      index,
      null,
      true
    )
  );
  const peers = [200, 300].map(client => {
    const tree = new NodeTree(new Y.Doc());
    tree.doc.clientID = client;
    Y.applyUpdate(tree.doc, Y.encodeStateAsUpdate(base.doc));
    const editor = withNodeTree(createEditor(), tree, {});
    editor.connectNodeTree();
    return { tree, editor };
  });
  return {
    left: peers[0],
    right: peers[1],
    exchange() {
      const updates = peers.map(peer => Y.encodeStateAsUpdate(peer.tree.doc));
      peers.forEach(peer => updates.forEach(update => Y.applyUpdate(peer.tree.doc, update)));
      expect(peers[0].tree.read()).toEqual(peers[1].tree.read());
      peers.forEach(peer => expect(peer.editor.children).toEqual(peer.tree.read()));
      return peers[0].tree.read().map(node => Node.string(node as never));
    },
    dispose() {
      peers.forEach(peer => {
        peer.editor.disposeNodeTree();
        peer.tree.doc.destroy();
      });
      base.doc.destroy();
    },
  };
}

describe("候选模型的拆段与合段并发门槛", () => {
  it("协作选区可序列化并跟随拆段、移动和合段，拒绝错误作用域与损坏载荷", () => {
    const { left, right, exchange, dispose } = setup(["abcd", "x"]);
    try {
      Transforms.select(right.editor, { path: [0, 0], offset: 3 });
      const wire = JSON.parse(JSON.stringify(right.editor.captureNodeTreeSelection()));
      split(left.editor, [0, 0], 2);
      exchange();
      expect(left.editor.resolveNodeTreeSelection(wire)?.anchor).toEqual({
        path: [1, 0],
        offset: 1,
      });
      Transforms.moveNodes(left.editor, { at: [1], to: [2] });
      exchange();
      expect(left.editor.resolveNodeTreeSelection(wire)?.anchor).toEqual({
        path: [2, 0],
        offset: 1,
      });
      Transforms.moveNodes(left.editor, { at: [2], to: [1] });
      Transforms.mergeNodes(left.editor, { at: [1] });
      exchange();
      expect(left.editor.resolveNodeTreeSelection(wire)?.anchor).toEqual({
        path: [0, 0],
        offset: 3,
      });
      expect(left.editor.resolveNodeTreeSelection({ ...wire, rootId: "another-root" })).toBeNull();
      expect(left.editor.resolveNodeTreeSelection({ ...wire, anchor: "invalid!!!!" })).toBeNull();
      expect(
        left.editor.resolveNodeTreeSelection({ ...wire, anchor: "a".repeat(5000) })
      ).toBeNull();
      Transforms.removeNodes(left.editor, { at: [0] });
      expect(left.editor.resolveNodeTreeSelection(wire)).toBeNull();
    } finally {
      dispose();
    }
  });

  it("退格合段与原段远端输入并发时，正文保留输入", () => {
    const { left, right, exchange, dispose } = setup(["甲", "乙"]);
    try {
      Transforms.select(left.editor, { path: [1, 0], offset: 0 });
      left.editor.deleteBackward("character");
      Transforms.insertText(right.editor, "丙", { at: { path: [1, 0], offset: 1 } });
      expect(exchange()).toEqual(["甲乙丙"]);
    } finally {
      dispose();
    }
  });

  it("两端合并同一段不重复正文", () => {
    const { left, right, exchange, dispose } = setup(["甲", "乙"]);
    try {
      for (const peer of [left, right]) {
        Transforms.select(peer.editor, { path: [1, 0], offset: 0 });
        peer.editor.deleteBackward("character");
      }
      expect(exchange()).toEqual(["甲乙"]);
    } finally {
      dispose();
    }
  });

  it("两端在同一点回车不重复原文字", () => {
    const { left, right, exchange, dispose } = setup(["甲乙"]);
    try {
      for (const peer of [left, right]) {
        Transforms.select(peer.editor, { path: [0, 0], offset: 1 });
        peer.editor.insertBreak();
      }
      expect(exchange().join("")).toBe("甲乙");
    } finally {
      dispose();
    }
  });
});

function split(editor: ReturnType<typeof withNodeTree>, path: number[], offset: number) {
  Transforms.select(editor, { path, offset });
  editor.insertBreak();
}
function merge(editor: ReturnType<typeof withNodeTree>, path = [1, 0]) {
  Transforms.select(editor, { path, offset: 0 });
  editor.deleteBackward("character");
}

describe("片段位置、格式与历史", () => {
  it("输入只使受影响片段的节点快照失效", () => {
    const { left, right, exchange, dispose } = setup(["甲乙丙丁戊己"]);
    try {
      split(left.editor, [0, 0], 2);
      split(left.editor, [1, 0], 2);
      exchange();
      const before = right.tree.snapshot();
      Transforms.insertText(left.editor, "新", { at: { path: [1, 0], offset: 1 } });
      exchange();
      const after = right.tree.snapshot();
      expect(after[1]).not.toBe(before[1]);
      expect(after[2]).toBe(before[2]);
    } finally {
      dispose();
    }
  });
  it.each([7, 41, 97])("多轮离线拆并、移动和输入保持字符唯一，种子 %i", seed => {
    const { left, right, exchange, dispose } = setup(["甲乙丙", "丁戊己", "庚辛壬"]);
    let random = seed;
    const next = (count: number) => {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      return random % count;
    };
    const expected = [..."甲乙丙丁戊己庚辛壬"];
    const originals = [left, right].map(peer =>
      ["node-0", "node-1", "node-2"].map(id => peer.tree.content(id))
    );
    try {
      for (let round = 0; round < 12; round++) {
        for (const [peerIndex, peer] of [left, right].entries()) {
          for (let step = 0; step < 2; step++) {
            const index = next(peer.editor.children.length),
              text = Node.string(peer.editor.children[index]);
            const action = next(4);
            if (action === 0) split(peer.editor, [index, 0], next(text.length + 1));
            else if (action === 1 && index > 0) merge(peer.editor, [index, 0]);
            else if (action === 2 && peer.editor.children.length > 1)
              Transforms.moveNodes(peer.editor, {
                at: [index],
                to: [next(peer.editor.children.length)],
              });
            else {
              const input = String.fromCharCode(0xe000 + round * 4 + peerIndex * 2 + step);
              expected.push(input);
              Transforms.insertText(peer.editor, input, {
                at: { path: [index, 0], offset: next(text.length + 1) },
              });
            }
          }
        }
        expect([...exchange().join("")].sort()).toEqual([...expected].sort());
        [left, right].forEach((peer, peerIndex) =>
          ["node-0", "node-1", "node-2"].forEach((id, index) =>
            expect(peer.tree.content(id)).toBe(originals[peerIndex][index])
          )
        );
      }
      const restored = new NodeTree(new Y.Doc());
      try {
        Y.applyUpdate(restored.doc, Y.encodeStateAsUpdate(left.tree.doc));
        expect(restored.read()).toEqual(left.tree.read());
      } finally {
        restored.doc.destroy();
      }
    } finally {
      dispose();
    }
  });
  it("并发拆分收敛后，可以在两个新段之间插入普通段落", () => {
    const { left, right, exchange, dispose } = setup(["甲乙丙丁"]);
    try {
      split(left.editor, [0, 0], 3);
      split(right.editor, [0, 0], 1);
      expect(exchange()).toEqual(["甲", "乙丙", "丁"]);
      Transforms.insertNodes(
        left.editor,
        { type: "paragraph", children: [{ type: "formatted", text: "插入" }] },
        { at: [2] }
      );
      expect(exchange()).toEqual(["甲", "乙丙", "插入", "丁"]);
    } finally {
      dispose();
    }
  });
  it("相邻段交叉合并时，晚到的片段沿合并关系进入幸存段", () => {
    const { left, right, exchange, dispose } = setup(["甲", "乙", "丙"]);
    try {
      merge(left.editor);
      merge(right.editor, [2, 0]);
      expect(exchange()).toEqual(["甲乙丙"]);
      left.editor.undo();
      expect(exchange()).toEqual(["甲", "乙丙"]);
      right.editor.undo();
      expect(exchange()).toEqual(["甲", "乙", "丙"]);
    } finally {
      dispose();
    }
  });
  it("拆分与合并交叉后，撤销拆分把文字归回当前幸存段", () => {
    const { left, right, exchange, dispose } = setup(["甲", "乙丙"]);
    try {
      split(left.editor, [1, 0], 1);
      merge(right.editor);
      expect(exchange().join("")).toBe("甲乙丙");
      left.editor.undo();
      expect(exchange()).toEqual(["甲乙丙"]);
      left.editor.redo();
      expect(exchange().join("")).toBe("甲乙丙");
    } finally {
      dispose();
    }
  });

  it("连续拆分与另一端较早位置拆分并发，段落顺序不反转", () => {
    const { left, right, exchange, dispose } = setup(["甲乙丙丁戊"]);
    try {
      split(left.editor, [0, 0], 2);
      split(left.editor, [1, 0], 2);
      split(right.editor, [0, 0], 1);
      expect(exchange()).toEqual(["甲", "乙", "丙丁", "戊"]);
    } finally {
      dispose();
    }
  });
  it.each([false, true])("不同位置并发拆分按原文字顺序呈现，交换分配 %s", reverse => {
    const { left, right, exchange, dispose } = setup(["甲乙丙丁"]);
    try {
      split(left.editor, [0, 0], reverse ? 3 : 1);
      split(right.editor, [0, 0], reverse ? 1 : 3);
      expect(exchange()).toEqual(["甲", "乙丙", "丁"]);
    } finally {
      dispose();
    }
  });

  it("拆分与尾部输入并发，选区跟随原文字进入新段", () => {
    const { left, right, exchange, dispose } = setup(["甲乙丙"]);
    try {
      split(left.editor, [0, 0], 1);
      Transforms.select(right.editor, { path: [0, 0], offset: 3 });
      Transforms.insertText(right.editor, "丁");
      expect(exchange()).toEqual(["甲", "乙丙丁"]);
      expect(right.editor.selection?.anchor).toEqual({ path: [1, 0], offset: 3 });
      left.editor.undo();
      expect(exchange()).toEqual(["甲乙丙丁"]);
      expect(right.editor.selection?.anchor).toEqual({ path: [0, 0], offset: 4 });
      left.editor.redo();
      expect(exchange()).toEqual(["甲", "乙丙丁"]);
    } finally {
      dispose();
    }
  });

  it("合并的撤销恢复原段及远端输入，重做仍只出现一次", () => {
    const { left, right, exchange, dispose } = setup(["甲", "乙"]);
    try {
      const original = left.tree.content("node-1");
      merge(left.editor);
      Transforms.select(right.editor, { path: [1, 0], offset: 1 });
      Transforms.insertText(right.editor, "丙");
      expect(exchange()).toEqual(["甲乙丙"]);
      expect(right.editor.selection?.anchor).toEqual({ path: [0, 0], offset: 3 });
      left.editor.undo();
      expect(exchange()).toEqual(["甲", "乙丙"]);
      expect(left.tree.content("node-1")).toBe(original);
      left.editor.redo();
      expect(exchange()).toEqual(["甲乙丙"]);
    } finally {
      dispose();
    }
  });

  it("拆分与远端格式和删除并发保留原字符语义", () => {
    const { left, right, exchange, dispose } = setup(["甲乙丙丁"]);
    try {
      split(left.editor, [0, 0], 1);
      Transforms.select(right.editor, {
        anchor: { path: [0, 0], offset: 1 },
        focus: { path: [0, 0], offset: 3 },
      });
      Editor.addMark(right.editor, "bold", true);
      Transforms.delete(right.editor, {
        at: { anchor: { path: [0, 2], offset: 0 }, focus: { path: [0, 2], offset: 1 } },
      });
      expect(exchange()).toEqual(["甲", "乙丙"]);
      expect(left.editor.children[1]).toMatchObject({ children: [{ text: "乙丙", bold: true }] });
    } finally {
      dispose();
    }
  });

  it("拆分后整块移动仍保留原片段输入", () => {
    const { left, right, exchange, dispose } = setup(["甲乙", "丙"]);
    try {
      split(left.editor, [0, 0], 1);
      exchange();
      left.editor.undoManager.stopCapturing();
      Transforms.moveNodes(left.editor, { at: [1], to: [2] });
      Transforms.insertText(right.editor, "丁", { at: { path: [1, 0], offset: 1 } });
      expect(exchange()).toEqual(["甲", "丙", "乙丁"]);
      left.editor.undo();
      expect(exchange()).toEqual(["甲", "乙丁", "丙"]);
    } finally {
      dispose();
    }
  });

  it("合并多个来源后可跨片段删除，再拆分和撤销", () => {
    const { left, right, exchange, dispose } = setup(["甲乙", "丙丁"]);
    try {
      merge(left.editor);
      exchange();
      left.editor.undoManager.stopCapturing();
      Transforms.delete(left.editor, {
        at: { anchor: { path: [0, 0], offset: 1 }, focus: { path: [0, 0], offset: 3 } },
      });
      expect(exchange()).toEqual(["甲丁"]);
      left.editor.undo();
      expect(exchange()).toEqual(["甲乙丙丁"]);
      left.editor.undoManager.stopCapturing();
      split(left.editor, [0, 0], 3);
      expect(exchange()).toEqual(["甲乙丙", "丁"]);
      Transforms.insertText(right.editor, "戊", { at: { path: [1, 0], offset: 1 } });
      expect(exchange()).toEqual(["甲乙丙", "丁戊"]);
      left.editor.undo();
      expect(exchange()).toEqual(["甲乙丙丁戊"]);
    } finally {
      dispose();
    }
  });

  it("空段回车后的远端输入在撤销拆分时仍保留", () => {
    const { left, right, exchange, dispose } = setup(["甲"]);
    try {
      split(left.editor, [0, 0], 1);
      expect(exchange()).toEqual(["甲", ""]);
      Transforms.insertText(right.editor, "乙", { at: { path: [1, 0], offset: 0 } });
      expect(exchange()).toEqual(["甲", "乙"]);
      left.editor.undo();
      expect(exchange()).toEqual(["甲乙"]);
    } finally {
      dispose();
    }
  });
});
