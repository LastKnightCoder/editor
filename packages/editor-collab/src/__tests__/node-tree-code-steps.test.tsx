import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import * as Y from "yjs";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor, createEditorKit } from "@tau/editor";
import { createDefaultEditorSlots } from "@tau/editor/extensions/media/slots";
import { IEditorSlots } from "@tau/editor/extensions/media/services";
import { ElementContractCatalog } from "../../../plugins/src/editor-contracts";
import { NodeTree } from "@tau/collaboration";
import { createNodeTreeDocument } from "../nodeTreeDocument";
import type { NodeTreeEditor } from "../withNodeTree";

import { Transforms } from "slate";
import { codeBlockV2Extension } from "@tau/editor/extensions/code-block";
import {
  codeBlockView,
  codeStepId,
  insertCodeStep,
  removeCodeStep,
} from "../../../editor/src/extensions/code-block/src/codeSteps";
import type { CodeBlockV2Element } from "@tau/editor/extensions/code-block/types";

vi.mock("../../../editor-source-view/src/overlay/shikiHighlighter", () => ({
  getShikiHighlighter: vi.fn(async () => null),
  getShikiTheme: () => "light",
  renderCodeWithShiki: vi.fn(async (code: string) => code),
  resolveShikiLanguage: (language: string) => language,
}));

describe("代码步骤真实控件", () => {
  it("切步只改本机状态，重排与远端输入保持源码归属，撤销保留远端输入", async () => {
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
    const tree = new NodeTree(new Y.Doc());
    const remote = new NodeTree(new Y.Doc());
    const catalog = await ElementContractCatalog.prepare([
      { owner: "tau.code-block", elements: codeBlockV2Extension.elements! },
    ]);
    await tree.installContracts(catalog.dictionary, null);
    Object.defineProperty(globalThis, "crypto", { value: originalCrypto, configurable: true });
    tree.insertNode(
      {
        type: "code-block",
        collabId: "block",
        uuid: "block",
        language: "text",
        tauContract: catalog.current("code-block")!.id,
        children: ["first", "second"].map((id, index) => ({
          type: "code-step",
          collabId: id,
          code: index ? "B" : "A",
          tauContract: catalog.current("code-step")!.id,
          children: [{ text: "" }],
        })),
      },
      null,
      0,
      null,
      true
    );
    Y.applyUpdate(remote.doc, Y.encodeStateAsUpdate(tree.doc));
    const kit = createEditorKit({
      extensions: [codeBlockV2Extension],
      services: [register => register(IEditorSlots, createDefaultEditorSlots())],
    });
    const source = createNodeTreeDocument(tree, { versions: catalog });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    let editor: NodeTreeEditor;
    try {
      await act(async () => {
        root.render(
          <DndProvider backend={HTML5Backend}>
            <Editor
              kit={kit}
              document={source}
              readonly={false}
              onInit={value => {
                editor = value as NodeTreeEditor;
              }}
            />
          </DndProvider>
        );
      });
      await act(async () => {
        await vi.dynamicImportSettled();
      });
      const input = () =>
        container.querySelector("textarea.code-block-shiki-input") as HTMLTextAreaElement;
      expect(input()).not.toBeNull();
      expect(input().value).toBe("A");
      expect(input().readOnly).toBe(false);
      const before = Y.encodeStateVector(tree.doc);
      const block = () => editor.children[0] as CodeBlockV2Element;
      await act(async () => codeBlockView(editor, block()).update({ activeStepId: "second" }));
      expect(input().value).toBe("B");
      expect(Y.encodeStateVector(tree.doc)).toEqual(before);
      await act(async () => codeBlockView(editor, block()).update({ activeStepId: "first" }));
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
          input(),
          "A本机"
        );
        input().dispatchEvent(new Event("input", { bubbles: true }));
        expect(tree.textField("first", "code").toString()).toBe("A本机");
      });
      await act(async () => {
        for (const next of ["A本机1", "A本机12"]) {
          Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
            input(),
            next
          );
          input().dispatchEvent(new Event("input", { bubbles: true }));
        }
      });
      expect(tree.textField("first", "code").toString()).toBe("A本机12");
      editor!.undoManager.stopCapturing();
      await act(async () => {
        Transforms.moveNodes(editor, { at: [0, 0], to: [0, 1], voids: true });
        remote.textField("first", "code").insert(1, "远端");
        Y.applyUpdate(tree.doc, Y.encodeStateAsUpdate(remote.doc));
      });
      expect(input().value).toContain("远端");
      expect(input().value).toContain("本机");
      expect(block().children[1].collabId).toBe("first");
      await act(async () => editor.undo());
      expect(block().children[0].collabId).toBe("first");
      expect(input().value).toContain("远端");
      Y.applyUpdate(remote.doc, Y.encodeStateAsUpdate(tree.doc));
      await act(async () => {
        remote.moveNode("first", "block", 1, {});
        Y.applyUpdate(tree.doc, Y.encodeStateAsUpdate(remote.doc));
      });
      expect(block().children.map(step => step.collabId)).toEqual(["second", "first"]);
      expect(input().value).toBe(tree.textField("first", "code").toString());
      await act(async () => {
        remote.moveNode("first", "block", 0, {});
        Y.applyUpdate(tree.doc, Y.encodeStateAsUpdate(remote.doc));
      });
      expect(block().children.map(step => step.collabId)).toEqual(["first", "second"]);

      await act(async () => {
        editor.undoManager.stopCapturing();
        insertCodeStep(editor, block());
      });
      const inserted = codeStepId(editor, block().children[1]);
      expect(inserted).not.toBe("first");
      expect(codeBlockView(editor, block()).getSnapshot().activeStepId).toBe(inserted);
      expect(tree.nodeSnapshot("block")).not.toHaveProperty("code");
      expect(tree.nodeSnapshot("block")).not.toHaveProperty("magicMove");
      await act(async () => removeCodeStep(editor, block()));
      expect(block().children).toHaveLength(2);
      expect(block().children.map(step => step.collabId)).not.toContain(inserted);
      await act(async () => codeBlockView(editor, block()).update({ activeStepId: "first" }));
      Y.applyUpdate(remote.doc, Y.encodeStateAsUpdate(tree.doc));
      const compositionValue = input().value + "汉";
      await act(async () => {
        input().dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
          input(),
          compositionValue
        );
        input().dispatchEvent(new Event("input", { bubbles: true }));
        remote.textField("first", "code").insert(0, "前");
        Y.applyUpdate(tree.doc, Y.encodeStateAsUpdate(remote.doc));
      });
      expect(input().value).toBe(compositionValue);
      await act(async () =>
        input().dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }))
      );
      expect(input().value).toBe("前" + compositionValue);
      expect(tree.textField("first", "code").toString()).toBe(input().value);
      const oldInput = input(),
        pendingComposition = oldInput.value + "切步前输入";
      await act(async () => {
        oldInput.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
          oldInput,
          pendingComposition
        );
        oldInput.dispatchEvent(new Event("input", { bubbles: true }));
        codeBlockView(editor, block()).update({ activeStepId: "second" });
      });
      expect(tree.textField("first", "code").toString()).toBe(pendingComposition);
      expect(input().value).toBe("B");
      oldInput.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
      expect(tree.textField("second", "code").toString()).toBe("B");
      await act(async () => {
        Transforms.removeNodes(editor, { at: [0, 0], voids: true });
        remote.removeNode("second", {});
        Y.applyUpdate(tree.doc, Y.encodeStateAsUpdate(remote.doc));
      });
      expect(block().children.filter(step => step.type === "code-step")).toHaveLength(0);
      await act(async () => insertCodeStep(editor, block()));
      expect(block().children.filter(step => step.type === "code-step")).toHaveLength(1);
      expect(input().readOnly).toBe(false);
      expect(tree.nodeSnapshot("block")).not.toHaveProperty("code");
    } finally {
      await act(async () => root.unmount());
      container.remove();
      tree.doc.destroy();
      remote.doc.destroy();
    }
  });
});
