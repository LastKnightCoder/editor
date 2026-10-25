import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { Editor, Node, Transforms, createEditor } from "slate";
import { NodeTree, type ContentNode } from "@tau/collaboration";
import { withNodeTree } from "../withNodeTree";

const paragraph = (id: string, text = id): ContentNode => ({
  type: "paragraph",
  collabId: id,
  children: [{ type: "formatted", text }],
});

function setup(initial = [paragraph("A"), paragraph("B"), paragraph("C")]) {
  const base = new NodeTree(new Y.Doc());
  base.doc.clientID = 100;
  initial.forEach((node, index) => base.insertNode(node, null, index, null, true));
  const fork = (id: number) => {
    const tree = new NodeTree(new Y.Doc());
    tree.doc.clientID = id;
    Y.applyUpdate(tree.doc, Y.encodeStateAsUpdate(base.doc));
    const editor = withNodeTree(createEditor(), tree, {});
    editor.connectNodeTree();
    return { tree, editor };
  };
  const left = fork(200),
    right = fork(300);
  const exchange = () => {
    const a = Y.encodeStateAsUpdate(left.tree.doc),
      b = Y.encodeStateAsUpdate(right.tree.doc);
    Y.applyUpdate(left.tree.doc, b);
    Y.applyUpdate(right.tree.doc, a);
    expect(left.tree.read()).toEqual(right.tree.read());
    expect(left.editor.children).toEqual(right.editor.children);
    expect(left.editor.children).toEqual(left.tree.read());
  };
  const dispose = () => {
    for (const { tree, editor } of [left, right]) {
      editor.disconnectNodeTree();
      editor.undoManager.destroy();
      tree.doc.destroy();
    }
    base.doc.destroy();
  };
  return { left, right, exchange, dispose };
}

describe("稳定节点的 Slate 操作绑定", () => {
  it("删除父元素只删除观察到的子树，远端新增子节点可恢复并随撤销归位", () => {
    const { left, right, exchange, dispose } = setup([
      { type: "blockquote", collabId: "P", children: [paragraph("A")] },
      paragraph("B"),
    ]);
    try {
      Transforms.removeNodes(left.editor, { at: [0] });
      Transforms.insertNodes(
        right.editor,
        {
          type: "paragraph",
          children: [{ type: "formatted", text: "远端新增" }],
        },
        { at: [0, 1] }
      );
      const inserted = Node.get(right.editor, [0, 1]) as { collabId: string };
      const content = right.tree.content(inserted.collabId);
      exchange();
      expect(left.editor.children.map(node => Node.string(node))).toEqual(["B", "远端新增"]);
      expect(left.tree.isDeleted("A")).toBe(true);
      left.editor.undo();
      exchange();
      expect(left.editor.children[0]).toMatchObject({
        collabId: "P",
        children: [{ collabId: "A" }, { collabId: inserted.collabId }],
      });
      expect(right.tree.content(inserted.collabId)).toBe(content);
      left.editor.redo();
      exchange();
      expect(left.editor.children.map(node => Node.string(node))).toEqual(["B", "远端新增"]);
    } finally {
      dispose();
    }
  });

  it("真实 Slate 并发移动与输入不复制块、不丢文字", () => {
    const { left, right, exchange, dispose } = setup();
    try {
      Transforms.moveNodes(left.editor, { at: [0], to: [2] });
      Transforms.moveNodes(right.editor, { at: [0], to: [1] });
      Transforms.insertText(left.editor, "甲", { at: { path: [2, 0], offset: 1 } });
      Transforms.insertText(right.editor, "乙", { at: { path: [1, 0], offset: 1 } });
      exchange();
      expect(left.editor.children.map(node => Node.string(node)).sort()).toEqual(
        ["A甲乙", "B", "C"].sort()
      );
    } finally {
      dispose();
    }
  });

  it("一端移动时另一端选区跟随原内容，输入仍合并", () => {
    const { left, right, exchange, dispose } = setup();
    try {
      Transforms.select(right.editor, { path: [0, 0], offset: 1 });
      const reference = Editor.pathRef(right.editor, [0]);
      Transforms.moveNodes(left.editor, { at: [0], to: [2] });
      Transforms.insertText(right.editor, "乙", { at: { path: [0, 0], offset: 1 } });
      exchange();
      expect(right.editor.selection?.anchor).toEqual({ path: [2, 0], offset: 2 });
      expect(reference.current).toEqual([2]);
      reference.unref();
      expect(Node.string(right.editor.children[2])).toBe("A乙");
    } finally {
      dispose();
    }
  });

  it("远端跨父节点移动使用 Slate move 保留 PathRef", () => {
    const { left, right, exchange, dispose } = setup([
      { type: "blockquote", collabId: "P", children: [paragraph("A")] },
      { type: "blockquote", collabId: "Q", children: [paragraph("B")] },
    ]);
    try {
      const reference = Editor.pathRef(right.editor, [0, 0]);
      Transforms.moveNodes(left.editor, { at: [0, 0], to: [1, 1] });
      Transforms.insertText(right.editor, "乙", { at: { path: [0, 0, 0], offset: 1 } });
      exchange();
      expect(reference.current).toEqual([1, 1]);
      reference.unref();
      expect(Node.string(Node.get(left.editor, [1, 1]))).toBe("A乙");
    } finally {
      dispose();
    }
  });

  it("撤销移动不撤远端输入，重做不创建副本", () => {
    const { left, right, exchange, dispose } = setup();
    try {
      Transforms.moveNodes(left.editor, { at: [0], to: [2] });
      Transforms.insertText(right.editor, "乙", { at: { path: [0, 0], offset: 1 } });
      exchange();
      left.editor.undo();
      exchange();
      expect(Node.string(left.editor.children[0])).toBe("A乙");
      left.editor.redo();
      exchange();
      expect(Node.string(left.editor.children[2])).toBe("A乙");
    } finally {
      dispose();
    }
  });

  it("基本插入、删除和文字标记同步", () => {
    const { left, right, exchange, dispose } = setup();
    try {
      Transforms.insertNodes(
        left.editor,
        { type: "paragraph", children: [{ type: "formatted", text: "新增" }] },
        { at: [1] }
      );
      Transforms.removeNodes(left.editor, { at: [0] });
      Transforms.setNodes(
        left.editor,
        { bold: true },
        { at: [0, 0], match: node => "text" in node }
      );
      exchange();
      expect(right.editor.children[0]).toMatchObject({ children: [{ text: "新增", bold: true }] });
      Transforms.delete(right.editor, {
        at: { anchor: { path: [0, 0], offset: 0 }, focus: { path: [0, 0], offset: 1 } },
      });
      exchange();
      expect(Node.string(left.editor.children[0])).toBe("增");
    } finally {
      dispose();
    }
  });

  it("回车拆分与退格合并的本地结果可同步", () => {
    const { left, right, exchange, dispose } = setup([paragraph("A", "甲乙")]);
    try {
      Transforms.select(left.editor, { path: [0, 0], offset: 1 });
      left.editor.insertBreak();
      exchange();
      expect(right.editor.children.map(node => Node.string(node))).toEqual(["甲", "乙"]);
      Transforms.select(right.editor, { path: [1, 0], offset: 0 });
      right.editor.deleteBackward("character");
      exchange();
      expect(left.editor.children.map(node => Node.string(node))).toEqual(["甲乙"]);
    } finally {
      dispose();
    }
  });

  it("断开后不接受编辑与撤销写回，重连按稳定文本位置恢复选区", () => {
    const { left, right, exchange, dispose } = setup();
    try {
      Transforms.select(left.editor, { path: [0, 0], offset: 1 });
      Transforms.insertText(left.editor, "甲", { at: { path: [0, 0], offset: 1 } });
      exchange();
      left.editor.disconnectNodeTree();
      const before = Y.encodeStateAsUpdate(left.tree.doc);
      left.editor.undo();
      expect(Y.encodeStateAsUpdate(left.tree.doc)).toEqual(before);
      Transforms.moveNodes(right.editor, { at: [0], to: [2] });
      Y.applyUpdate(left.tree.doc, Y.encodeStateAsUpdate(right.tree.doc));
      left.editor.connectNodeTree();
      expect(left.editor.selection?.anchor).toEqual({ path: [2, 0], offset: 2 });
      expect(left.editor.children).toEqual(right.editor.children);
    } finally {
      dispose();
    }
  });

  it("局部格式操作经文本拆分与合并后保持同步", () => {
    const { left, right, exchange, dispose } = setup([paragraph("A", "甲乙丙")]);
    try {
      Transforms.select(left.editor, {
        anchor: { path: [0, 0], offset: 1 },
        focus: { path: [0, 0], offset: 2 },
      });
      Editor.addMark(left.editor, "bold", true);
      exchange();
      expect(right.editor.children[0]).toMatchObject({
        children: [{ text: "甲" }, { text: "乙", bold: true }, { text: "丙" }],
      });
    } finally {
      dispose();
    }
  });
});
