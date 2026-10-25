import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import * as Y from "yjs";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Transforms } from "slate";
import { Editor, createEditorKit } from "@tau/editor";
import { defineElement, defineExtension } from "@tau/editor/api";
import { elementRuntime } from "@tau/editor/source";
import { ElementContractCatalog } from "../../../plugins/src/editor-contracts";
import { NodeTree } from "@tau/collaboration";
import { createNodeTreeDocument } from "../nodeTreeDocument";
import type { NodeTreeEditor } from "../withNodeTree";

describe("真实编辑器按节点契约分发", () => {
  it("同一类型的 v1/v2 使用各自组件和行为，只读旧版禁止内部写入", async () => {
    const oldNormalize = vi.fn(() => false);
    const newNormalize = vi.fn(() => false);
    const previous = defineElement({
      type: "example.source",
      dataVersion: 1,
      kind: "block",
      isVoid: true,
      collaboration: { textFields: ["source"] },
      behaviors: { normalize: oldNormalize },
      render: ({ attributes, element, children }) => {
        const access = elementRuntime.useElement(element);
        return (
          <div {...attributes} data-version="1" data-readonly={String(access.readOnly)}>
            {String((element as unknown as { source: string }).source)}
            {children}
          </div>
        );
      },
    });
    const current = defineElement({
      type: "example.source",
      dataVersion: 2,
      kind: "block",
      isVoid: true,
      collaboration: { textFields: ["code"] },
      previousVersions: [{ element: previous, access: "read" }],
      behaviors: { normalize: newNormalize },
      render: ({ attributes, element, children }) => (
        <div {...attributes} data-version="2">
          {String((element as unknown as { code: string }).code)}
          {children}
        </div>
      ),
    });
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
    let catalog: ElementContractCatalog;
    const tree = new NodeTree(new Y.Doc());
    try {
      catalog = await ElementContractCatalog.prepare([{ owner: "example", elements: [current] }]);
      await tree.installContracts(catalog.dictionary, null);
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: originalCrypto, configurable: true });
    }
    const oldId = Object.keys(catalog.dictionary).find(
      id => catalog.dictionary[id].dataVersion === 1
    )!;
    tree.insertNode(
      { type: "example.source", tauContract: oldId, source: "旧源码", children: [] },
      null,
      0,
      null
    );
    tree.insertNode(
      {
        type: "example.source",
        tauContract: catalog.current("example.source")!.id,
        code: "新源码",
        children: [],
      },
      null,
      1,
      null
    );
    const kit = createEditorKit({
      extensions: [defineExtension({ id: "example", elements: [current] })],
    });
    const documentSource = createNodeTreeDocument(tree, { versions: catalog });
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
              document={documentSource}
              readonly={false}
              onInit={value => (editor = value as NodeTreeEditor)}
            />
          </DndProvider>
        )
      );
      expect(container.querySelector('[data-version="1"]')?.textContent).toContain("旧源码");
      expect(container.querySelector('[data-version="1"]')?.getAttribute("data-readonly")).toBe(
        "true"
      );
      expect(container.querySelector('[data-version="2"]')?.textContent).toContain("新源码");
      expect(oldNormalize).not.toHaveBeenCalled();
      expect(newNormalize).toHaveBeenCalled();
      expect(() =>
        Transforms.setNodes(editor!, { title: "不能写入" } as never, { at: [0] })
      ).toThrow("只读");
      expect(tree.read()[0]).not.toHaveProperty("title");
      const field = editor!.openNodeTextField(editor!.children[1] as never, "code");
      await act(async () => field.replace("新版本更新", field.getSnapshot().revision));
      expect(container.querySelector('[data-version="2"]')?.textContent).toContain("新版本更新");
      expect(tree.read()[0].source).toBe("旧源码");
      field.dispose();
    } finally {
      await act(async () => root.unmount());
      editor?.undoManager.destroy();
      tree.doc.destroy();
      container.remove();
    }
  });
});
