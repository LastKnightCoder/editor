// P6：文档源（EditorDocument）的内核接入。协作用的 Yjs 文档源见 P7。
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Descendant, Editor as SlateEditor } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { Editor, createEditorKit, createValueDocument } from "../index";
import type { EditorDocument } from "../index";
import { createDefaultEditorSlots, IEditorSlots, IOpenerService } from "../services";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const kit = createEditorKit({
  services: [register => register(IEditorSlots, createDefaultEditorSlots())],
});

const paragraph = (text: string): Descendant =>
  ({ type: "paragraph", children: [{ type: "formatted", text }] }) as Descendant;

describe("EditorDocument", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = null;
    container?.remove();
    container = null;
    document.body.innerHTML = "";
  });

  const render = async (node: React.ReactNode) => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root?.render(<DndProvider backend={HTML5Backend}>{node}</DndProvider>);
    });
    return container;
  };

  it("文档源提供初始内容", async () => {
    const doc = createValueDocument([paragraph("来自文档源")]);
    const host = await render(<Editor kit={kit} document={doc} readonly />);
    expect(host.textContent).toContain("来自文档源");
  });

  it("文档源可以要求只读，与 readonly prop 取或", async () => {
    const doc: EditorDocument = {
      ...createValueDocument([paragraph("冻结")]),
      readonly: true,
    };
    const host = await render(<Editor kit={kit} document={doc} readonly={false} />);
    expect(host.querySelector("[data-slate-editor]")?.getAttribute("contenteditable")).toBe(
      "false"
    );
  });

  it("attach 在挂载时执行、卸载时清理", async () => {
    const dispose = vi.fn();
    const attach = vi.fn(() => dispose);
    const doc: EditorDocument = { ...createValueDocument([paragraph("x")]), attach };

    await render(<Editor kit={kit} document={doc} readonly />);
    expect(attach).toHaveBeenCalledTimes(1);
    expect(attach.mock.calls[0][0]).toBeTruthy();

    await act(async () => root?.unmount());
    root = null;
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("文档源的 services 覆盖 kit 的同名服务，且只作用于本编辑器", async () => {
    const open = vi.fn();
    const doc: EditorDocument = {
      ...createValueDocument([paragraph("x")]),
      services: register => register(IOpenerService, { open }),
    };
    await render(<Editor kit={kit} document={doc} readonly />);
    expect(kit.registry.tryGet(IOpenerService)).toBeUndefined();
  });

  it("subscribe 通知后重新读取只读状态", async () => {
    let frozen = false;
    const listeners = new Set<() => void>();
    const doc: EditorDocument = {
      lineage: "content-1",
      history: "slate",
      initialValue: [paragraph("x")],
      get readonly() {
        return frozen;
      },
      subscribe: listener => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const host = await render(<Editor kit={kit} document={doc} readonly={false} />);
    const editable = () =>
      host.querySelector("[data-slate-editor]")?.getAttribute("contenteditable");
    expect(editable()).toBe("true");

    await act(async () => {
      frozen = true;
      listeners.forEach(listener => listener());
    });
    expect(editable()).toBe("false");
  });

  it("内容变化经文档源的 onChange 回调", async () => {
    const onChange = vi.fn();
    const doc = createValueDocument([paragraph("x")], onChange);
    let editor: SlateEditor | null = null;
    await render(
      <Editor kit={kit} document={doc} readonly={false} onInit={value => (editor = value)} />
    );
    expect(editor).toBeTruthy();
    await act(async () => {
      editor!.insertText("y");
    });
    expect(onChange).toHaveBeenCalled();
  });
});
