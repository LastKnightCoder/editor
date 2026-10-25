import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Transforms } from "slate";
import { Editor, createEditorKit } from "@tau/editor";
import { NodeTree } from "@tau/collaboration";
import { createNodeTreeDocument } from "../nodeTreeDocument";
import type { NodeTreeEditor } from "../withNodeTree";

describe("稳定节点文档与真实编辑器", () => {
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
