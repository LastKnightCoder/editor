import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor as SlateEditor, Transforms } from "slate";
import { Editor, createEditorKit } from "@tau/editor";
import { defineElement, defineExtension } from "@tau/editor/api";
import { NodeTree } from "@tau/collaboration";
import { createNodeTreeDocument } from "../nodeTreeDocument";
import type { NodeTreeEditor } from "../withNodeTree";

describe("稳定节点文档与真实编辑器", () => {
  it.each([false, true])(
    "只读预览在 normalizeOnConnect=%s 时补齐行内落点，不写正文或撤销历史",
    async normalizeOnConnect => {
      const tree = new NodeTree(new Y.Doc());
      const paragraphId = tree.insertNode(
        {
          type: "paragraph",
          children: [{ type: "example.link", children: [{ type: "formatted", text: "引用卡片" }] }],
        },
        null,
        0,
        null
      );
      const kit = createEditorKit({
        extensions: [
          defineExtension({
            id: "example.link",
            elements: [
              defineElement({
                type: "example.link",
                dataVersion: 1,
                kind: "inline",
                render: ({ attributes, children }) => <span {...attributes}>{children}</span>,
              }),
            ],
          }),
        ],
      });
      const source = createNodeTreeDocument(tree, { readonly: true, normalizeOnConnect });
      const before = Y.encodeStateAsUpdate(tree.doc);
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);
      let editor: NodeTreeEditor | undefined;
      try {
        await act(async () =>
          root.render(
            <DndProvider backend={HTML5Backend}>
              <Editor
                kit={kit}
                document={source}
                readonly
                onInit={value => (editor = value as NodeTreeEditor)}
              />
            </DndProvider>
          )
        );
        if (!editor) throw new Error("只读编辑器未初始化");
        const preview = editor;
        expect(container.textContent).toContain("引用卡片");
        expect(preview.children[0]).toMatchObject({
          children: [{ text: "" }, { type: "example.link" }, { text: "" }],
        });
        expect(Y.encodeStateAsUpdate(tree.doc)).toEqual(before);
        await act(async () => tree.insertText(paragraphId, 1, "后续正文", "remote"));
        const updated = Y.encodeStateAsUpdate(tree.doc);
        await act(async () => SlateEditor.normalize(preview, { force: true }));
        expect(container.textContent).toContain("引用卡片后续正文");
        expect(() =>
          Transforms.insertText(preview, "不能写入", { at: { path: [0, 0], offset: 0 } })
        ).toThrow("只读");
        expect(preview.undoManager.undoStack).toHaveLength(0);
        expect(Y.encodeStateAsUpdate(tree.doc)).toEqual(updated);
      } finally {
        await act(async () => root.unmount());
        editor?.disposeNodeTree();
        tree.doc.destroy();
        container.remove();
      }
    }
  );

  it("两个视图共享内容，移动和输入同步，撤销只属于本地视图", async () => {
    const tree = new NodeTree(new Y.Doc());
    ["甲", "乙"].forEach((text, index) =>
      tree.insertNode(
        {
          type: "paragraph",
          children: [{ type: "formatted", text }],
        },
        null,
        index,
        null
      )
    );
    const kit = createEditorKit();
    const first = createNodeTreeDocument(tree);
    const second = createNodeTreeDocument(tree);
    const editors: NodeTreeEditor[] = [];
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          <DndProvider backend={HTML5Backend}>
            <Editor
              kit={kit}
              document={first}
              readonly={false}
              onInit={editor => (editors[0] = editor as NodeTreeEditor)}
            />
            <Editor
              kit={kit}
              document={second}
              readonly={false}
              onInit={editor => (editors[1] = editor as NodeTreeEditor)}
            />
          </DndProvider>
        )
      );
      expect(editors).toHaveLength(2);
      await act(async () => {
        Transforms.moveNodes(editors[0], { at: [0], to: [1] });
        Transforms.insertText(editors[1], "修改", { at: { path: [1, 0], offset: 1 } });
      });
      expect(editors[0].children).toEqual(editors[1].children);
      expect(container.textContent).toContain("甲修改");
      await act(async () => editors[0].undo());
      expect(tree.read()[0].children?.[0].text).toBe("甲修改");
      expect(editors[0].children).toEqual(editors[1].children);
    } finally {
      await act(async () => root.unmount());
      for (const editor of editors) editor.undoManager.destroy();
      tree.doc.destroy();
      container.remove();
    }
  });
});
