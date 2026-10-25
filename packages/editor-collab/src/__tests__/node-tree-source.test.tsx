import { Activity, act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import * as Y from "yjs";
import { Code2 } from "lucide-react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor, createEditorKit } from "@tau/editor";
import { defineElement, defineExtension } from "@tau/editor/api";
import { SourceBlockEditor } from "@tau/editor/source";
import { createDefaultEditorSlots } from "@tau/editor/extensions/media/slots";
import { IEditorSlots } from "@tau/editor/extensions/media/services";
import { ElementContractCatalog } from "../../../plugins/src/editor-contracts";
import { NodeTree } from "@tau/collaboration";
import { createNodeTreeDocument } from "../nodeTreeDocument";
import type { NodeTreeEditor } from "../withNodeTree";

vi.mock("../../../editor-source-view/src/overlay/shikiHighlighter", () => ({
  renderCodeWithShiki: vi.fn(async (code: string) => code),
  resolveShikiLanguage: vi.fn((language: string) => language),
}));

/** 源码输入框里在 offset 处插入文字：以原生输入方式写入，交给字段绑定计算增量 */
function typeAt(input: HTMLTextAreaElement, offset: number, text: string) {
  const next = `${input.value.slice(0, offset)}${text}${input.value.slice(offset)}`;
  input.setSelectionRange(offset, offset);
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, next);
  input.setSelectionRange(offset + text.length, offset + text.length);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("标准源码组件字段绑定", () => {
  it("实际源码输入框输入立即写入共享字段，接收远端变化并正确撤销", async () => {
    const windowFocus = vi.spyOn(window, "focus").mockImplementation(() => undefined);
    Object.defineProperty(Range.prototype, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }),
    });
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value: () => [],
    });
    const spec = defineElement({
      type: "example.source",
      dataVersion: 1,
      kind: "block",
      isVoid: true,
      collaboration: { textFields: ["source"] },
      render: props => (
        <div {...props.attributes}>
          <SourceBlockEditor
            element={props.element}
            field="source"
            mode="text"
            title="源码"
            icon={Code2}
          >
            <pre>{String((props.element as unknown as { source: string }).source)}</pre>
            {props.children}
          </SourceBlockEditor>
        </div>
      ),
    });
    const originalCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
    const tree = new NodeTree(new Y.Doc());
    let catalog: ElementContractCatalog;
    try {
      catalog = await ElementContractCatalog.prepare([{ owner: "example", elements: [spec] }]);
      await tree.installContracts(catalog.dictionary, null);
    } finally {
      Object.defineProperty(globalThis, "crypto", { value: originalCrypto, configurable: true });
    }
    const id = tree.insertNode(
      {
        type: "example.source",
        tauContract: catalog.current(spec.type)!.id,
        source: "初始",
        children: [],
      },
      null,
      0,
      null
    );
    const kit = createEditorKit({
      extensions: [defineExtension({ id: "example", elements: [spec] })],
      services: [register => register(IEditorSlots, createDefaultEditorSlots())],
    });
    const source = createNodeTreeDocument(tree, { versions: catalog });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    let editor: NodeTreeEditor | undefined;
    const render = (hidden = false) => (
      <DndProvider backend={HTML5Backend}>
        <Activity mode={hidden ? "hidden" : "visible"}>
          <Editor
            kit={kit}
            document={source}
            readonly={false}
            onInit={value => (editor = value as NodeTreeEditor)}
          />
        </Activity>
      </DndProvider>
    );
    try {
      await act(async () => root.render(render()));
      await act(async () => {
        document.dispatchEvent(new CustomEvent("preview-editor-focus", { detail: { path: [0] } }));
      });
      const input = container.querySelector<HTMLTextAreaElement>(".ed-preview-source textarea");
      expect(input).toBeTruthy();
      await act(async () => {
        typeAt(input!, 2, "甲");
        expect(tree.textField(id, "source").toString()).toBe("初始甲");
      });
      await act(async () =>
        tree.doc.transact(() => tree.textField(id, "source").insert(0, "乙"), "remote")
      );
      expect(input!.value).toBe("乙初始甲");
      expect(tree.read()[0].source).toBe("乙初始甲");
      await act(async () => {
        input!.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "z",
            keyCode: 90,
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
          })
        );
      });
      expect(tree.textField(id, "source").toString()).toBe("乙初始");
      expect(tree.read()[0].source).toBe("乙初始");
      expect(input!.value).toBe("乙初始");
      await act(async () => input!.blur());
      await act(async () => root.render(render(true)));
      tree.doc.transact(() => tree.textField(id, "source").insert(0, "丙"), "remote");
      await act(async () => root.render(render()));
      await act(async () => {
        document.dispatchEvent(new CustomEvent("preview-editor-focus", { detail: { path: [0] } }));
      });
      const resumed = container.querySelector<HTMLTextAreaElement>(".ed-preview-source textarea");
      expect(resumed?.value).toBe("丙乙初始");
      await act(async () => typeAt(resumed!, 4, "丁"));
      expect(tree.textField(id, "source").toString()).toBe("丙乙初始丁");
      await act(async () => resumed!.blur());
    } finally {
      await act(async () => root.unmount());
      editor?.undoManager.destroy();
      tree.doc.destroy();
      container.remove();
      windowFocus.mockRestore();
    }
  });
});
