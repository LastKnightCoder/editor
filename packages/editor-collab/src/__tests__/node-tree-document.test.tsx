import { act } from "react";
import { webcrypto } from "node:crypto";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor as SlateEditor, Node, Transforms } from "slate";
import { Editor, createEditorKit } from "@tau/editor";
import { defineElement, defineExtension } from "@tau/editor/api";
import underline, { unwrapUnderline, wrapUnderline } from "@tau/editor/extensions/underline";
import styledText, { unwrapStyledText, wrapStyledText } from "@tau/editor/extensions/styled-text";
import { textFormattingExtension } from "@tau/editor/extensions/text-formatting";
import { NodeTree, validateNodeTree } from "@tau/collaboration";
import { ElementContractCatalog } from "../../../plugins/src/editor-contracts";
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

  it.each([
    ["underline", wrapUnderline, unwrapUnderline],
    ["styled-text", wrapStyledText, unwrapStyledText],
  ] as const)("%s 包裹和取消选区格式时保留文字、标记和撤销历史", async (type, wrap, unwrap) => {
    const kit = createEditorKit({ extensions: [underline, styledText, textFormattingExtension] });
    const tree = new NodeTree(new Y.Doc());
    const remote = new NodeTree(new Y.Doc());
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    let editor: NodeTreeEditor;
    vi.stubGlobal("crypto", webcrypto);
    Object.defineProperties(Range.prototype, {
      getBoundingClientRect: { configurable: true, value: () => new DOMRect() },
      getClientRects: { configurable: true, value: () => [] },
    });
    try {
      const catalog = await ElementContractCatalog.prepare(
        kit.extensions.map(extension => ({
          owner: extension.id,
          elements: extension.elements ?? [],
        }))
      );
      await tree.installContracts(catalog.dictionary, null);
      const paragraph = catalog.current("paragraph");
      if (!paragraph) throw new Error("缺少段落契约");
      tree.insertNode(
        {
          type: "paragraph",
          collabId: "paragraph",
          tauContract: paragraph.id,
          children: [{ type: "formatted", text: "甲乙丙丁", bold: true }],
        },
        null,
        0,
        null,
        true
      );
      Y.applyUpdate(remote.doc, Y.encodeStateAsUpdate(tree.doc));
      const source = createNodeTreeDocument(tree, { versions: catalog });
      await act(async () =>
        root.render(
          <DndProvider backend={HTML5Backend}>
            <Editor
              kit={kit}
              document={source}
              readonly={false}
              onInit={value => (editor = value as NodeTreeEditor)}
            />
          </DndProvider>
        )
      );
      await act(async () => {
        Transforms.select(editor, {
          anchor: { path: [0, 0], offset: 1 },
          focus: { path: [0, 0], offset: 3 },
        });
        wrap(editor);
      });
      const wrapped = tree.read();
      expect(wrapped[0].children).toMatchObject([
        { text: "甲", bold: true },
        { type, children: [{ text: "乙丙", bold: true }] },
        { text: "丁", bold: true },
      ]);
      expect(editor.children).toEqual(wrapped);
      await validateNodeTree(tree.doc, "content", remote.doc);
      remote.insertText("paragraph", 2, "新", null, { type: "formatted", bold: true });
      await act(async () => Y.applyUpdate(tree.doc, Y.encodeStateAsUpdate(remote.doc)));
      Y.applyUpdate(remote.doc, Y.encodeStateAsUpdate(tree.doc));
      expect(remote.read()).toEqual(tree.read());
      expect(tree.read()[0].children?.[1].children?.[0].text).toBe("乙新丙");
      const wrappedWithRemoteEdit = tree.read();
      await act(async () => editor.undo());
      expect(tree.read()[0].children).toMatchObject([{ text: "甲乙新丙丁", bold: true }]);
      await act(async () => editor.redo());
      expect(tree.read()).toEqual(wrappedWithRemoteEdit);

      editor.undoManager.stopCapturing();
      await act(async () => {
        Transforms.select(editor, SlateEditor.range(editor, [0, 1]));
        expect(editor.commands?.execute("tau.mark.code", { source: "toolbar" })).toBe(true);
      });
      expect(tree.read()[0].children?.[1]).toMatchObject({
        type,
        children: [{ text: "乙新丙", bold: true, code: true }],
      });
      await act(async () => editor.undo());
      expect(tree.read()).toEqual(wrappedWithRemoteEdit);

      editor.undoManager.stopCapturing();
      await act(async () => {
        Transforms.select(editor, SlateEditor.range(editor, [0, 1]));
        unwrap(editor);
      });
      const unwrapped = tree.read();
      expect(unwrapped[0].children).toMatchObject([{ text: "甲乙新丙丁", bold: true }]);
      expect(editor.children).toEqual(unwrapped);
      await act(async () => editor.undo());
      expect(tree.read()).toEqual(wrappedWithRemoteEdit);
      await act(async () => editor.redo());
      expect(tree.read()).toEqual(unwrapped);

      await act(async () => {
        Transforms.select(editor, {
          anchor: { path: [0, 0], offset: 1 },
          focus: { path: [0, 0], offset: 4 },
        });
        expect(editor.commands?.execute("tau.mark.code", { source: "toolbar" })).toBe(true);
      });
      expect(tree.read()[0].children).toMatchObject([
        { text: "甲", bold: true },
        { text: "乙新丙", bold: true, code: true },
        { text: "丁", bold: true },
      ]);
      expect(Node.string(editor)).toBe("甲乙新丙丁");
    } finally {
      await act(async () => root.unmount());
      tree.doc.destroy();
      remote.doc.destroy();
      container.remove();
      vi.unstubAllGlobals();
    }
  });

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
