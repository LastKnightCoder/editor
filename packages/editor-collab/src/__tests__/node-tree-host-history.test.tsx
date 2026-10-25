import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { createEditor, Node, Transforms, type Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor, createEditorKit } from "@tau/editor";
import { NodeTree } from "@tau/collaboration";
import { createNodeTreeDocument } from "../nodeTreeDocument";
import { withNodeTree, type NodeTreeEditor } from "../withNodeTree";

function roots() {
  const doc = new Y.Doc();
  const first = new NodeTree(doc, { rootId: "body-a" });
  const second = new NodeTree(doc, { rootId: "body-b" });
  for (const [tree, text] of [
    [first, "甲"],
    [second, "乙"],
  ] as const)
    tree.insertNode(
      { type: "paragraph", collabId: "same", children: [{ type: "formatted", text }] },
      null,
      0,
      "initial",
      true
    );
  return { doc, first, second };
}

describe("富文本根的宿主历史注入", () => {
  it("连接规范化失败时释放该来源和订阅，不销毁宿主历史", () => {
    const { doc, first, second } = roots();
    const history = first.createUndoManager({ trackedOrigins: new Set() });
    const origin = {};
    const base = createEditor();
    base.normalizeNode = () => {
      throw new Error("规范化失败");
    };
    const broken = withNodeTree(base, first, origin, { history });
    const healthy = withNodeTree(createEditor(), second, {}, { history });
    try {
      expect(() => broken.connectNodeTree()).toThrow("规范化失败");
      expect(history.trackedOrigins.has(origin)).toBe(false);
      expect(history.isDisposed).toBe(false);
      healthy.connectNodeTree();
      Transforms.insertText(healthy, "正常", { at: { path: [0, 0], offset: 1 } });
      healthy.undo();
      expect(Node.string(second.read()[0] as Descendant)).toBe("乙");
    } finally {
      broken.disposeNodeTree();
      healthy.disposeNodeTree();
      history.destroy();
      doc.destroy();
    }
  });

  it("真实双编辑器共享宿主历史，卸载一个视图后历史和另一个根仍有效", async () => {
    const { doc, first, second } = roots();
    const history = first.createUndoManager({ trackedOrigins: new Set(), captureTimeout: 0 });
    const a = createNodeTreeDocument(first, { history });
    const b = createNodeTreeDocument(second, { history });
    expect(a.lineage).not.toBe(b.lineage);
    const kit = createEditorKit();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const instances = new Set<NodeTreeEditor>();
    let left: NodeTreeEditor, right: NodeTreeEditor;
    const render = (showFirst: boolean) => (
      <DndProvider backend={HTML5Backend}>
        {showFirst && (
          <Editor
            key="a"
            kit={kit}
            document={a}
            readonly={false}
            onInit={value => {
              left = value as NodeTreeEditor;
              instances.add(left);
            }}
          />
        )}
        <Editor
          key="b"
          kit={kit}
          document={b}
          readonly={false}
          onInit={value => {
            right = value as NodeTreeEditor;
            instances.add(right);
          }}
        />
      </DndProvider>
    );
    try {
      await act(async () => root.render(render(true)));
      expect(left!.undoManager).toBe(history);
      expect(right!.undoManager).toBe(history);
      await act(async () => {
        Transforms.insertText(left!, "一", { at: { path: [0, 0], offset: 1 } });
        Transforms.insertText(right!, "二", { at: { path: [0, 0], offset: 1 } });
      });
      await act(async () => root.render(render(false)));
      left!.disposeNodeTree();
      expect(history.isDisposed).toBe(false);
      await act(async () => right!.undo());
      expect(Node.string(second.read()[0] as Descendant)).toBe("乙");
      expect(Node.string(first.read()[0] as Descendant)).toBe("甲一");
      await act(async () => right!.undo());
      expect(Node.string(first.read()[0] as Descendant)).toBe("甲");
      await act(async () => {
        right!.redo();
        right!.redo();
      });
      await act(async () => root.render(render(true)));
      expect(left!.children[0]).toMatchObject({ children: [{ text: "甲一" }] });
      expect(right!.children[0]).toMatchObject({ children: [{ text: "乙二" }] });
    } finally {
      await act(async () => root.unmount());
      instances.forEach(editor => editor.disposeNodeTree());
      expect(history.isDisposed).toBe(false);
      history.destroy();
      doc.destroy();
      container.remove();
    }
  });

  it("连接/断开可重复，最终释放只销毁自有历史，旧编辑器和已关闭历史不能写入", () => {
    const { doc, first, second } = roots();
    const history = first.createUndoManager({ trackedOrigins: new Set() });
    const firstOrigin = {};
    const a = withNodeTree(createEditor(), first, firstOrigin, { history });
    const b = withNodeTree(createEditor(), second, {});
    try {
      a.connectNodeTree();
      b.connectNodeTree();
      expect(history.trackedOrigins.has(firstOrigin)).toBe(true);
      a.disconnectNodeTree();
      expect(history.trackedOrigins.has(firstOrigin)).toBe(false);
      a.connectNodeTree();
      a.disposeNodeTree();
      a.disposeNodeTree();
      expect(() => a.connectNodeTree()).toThrow("已释放");
      expect(history.isDisposed).toBe(false);
      b.disposeNodeTree();
      expect(b.undoManager.isDisposed).toBe(true);
      const active = withNodeTree(createEditor(), second, {}, { history });
      active.connectNodeTree();
      history.destroy();
      const before = Y.encodeStateAsUpdate(doc);
      expect(() =>
        Transforms.insertText(active, "不允许", { at: { path: [0, 0], offset: 0 } })
      ).toThrow("已释放");
      expect(Y.encodeStateAsUpdate(doc)).toEqual(before);
      active.disposeNodeTree();
    } finally {
      a.disposeNodeTree();
      b.disposeNodeTree();
      history.destroy();
      doc.destroy();
    }
  });

  it("切换根或历史时改变本地绑定身份，不能用相同业务 lineage 串根", () => {
    const { doc, first, second } = roots();
    const h1 = first.createUndoManager({ trackedOrigins: new Set() });
    const h2 = second.createUndoManager({ trackedOrigins: new Set() });
    const a = createNodeTreeDocument(first, { lineage: "same-business", history: h1 });
    const b = createNodeTreeDocument(second, { lineage: "same-business", history: h1 });
    const c = createNodeTreeDocument(first, { lineage: "same-business", history: h2 });
    const editor = withNodeTree(createEditor(), first, {}, { history: h1 });
    try {
      expect(new Set([a.lineage, b.lineage, c.lineage]).size).toBe(3);
      expect(createNodeTreeDocument(first, { lineage: "same-business", history: h1 }).lineage).toBe(
        a.lineage
      );
      expect(editor.configureNodeTree({ history: h2 })).toBe(false);
      expect(editor.undoManager).toBe(h1);
      const foreign = new NodeTree(new Y.Doc());
      expect(() => createNodeTreeDocument(foreign, { history: h1 })).toThrow("另一份");
      foreign.doc.destroy();
    } finally {
      editor.disposeNodeTree();
      h1.destroy();
      h2.destroy();
      doc.destroy();
    }
  });

  it("共享宿主历史不绕过当前编辑器只读状态", () => {
    const { doc, first, second } = roots();
    const history = first.createUndoManager({ trackedOrigins: new Set() });
    const writable = withNodeTree(createEditor(), first, {}, { history });
    const readonly = withNodeTree(createEditor(), second, {}, { history, readonly: true });
    try {
      writable.connectNodeTree();
      readonly.connectNodeTree();
      Transforms.insertText(writable, "修改", { at: { path: [0, 0], offset: 1 } });
      readonly.undo();
      expect(Node.string(first.read()[0] as Descendant)).toBe("甲修改");
      writable.undo();
      expect(Node.string(first.read()[0] as Descendant)).toBe("甲");
    } finally {
      writable.disposeNodeTree();
      readonly.disposeNodeTree();
      history.destroy();
      doc.destroy();
    }
  });
});
