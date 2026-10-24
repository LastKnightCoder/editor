import React, { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Editor as SlateEditor } from "slate";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import { IElementEditingPolicy } from "@tau/editor/api";
import { IEditorSlots } from "@tau/editor/extensions/media/services";
import { createDefaultEditorSlots } from "@tau/editor/extensions/media/slots";
import { inlineMathExtension } from "../index";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const paragraphWithMath = () => ({
  type: "paragraph",
  children: [
    { type: "formatted", text: "前" },
    { type: "inline-math", tex: "x^2", children: [{ type: "formatted", text: "" }] },
    { type: "formatted", text: "后" },
  ],
});

describe("行内公式原位编辑", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  let editor: SlateEditor;

  afterEach(async () => {
    await act(async () => root?.unmount());
    host?.remove();
    root = null;
    host = null;
  });

  const mount = async (touch = false) => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const ref = createRef<EditorRef>();
    const kit = createEditorKit({
      extensions: [inlineMathExtension],
      services: [
        register => {
          register(IEditorSlots, createDefaultEditorSlots());
          if (touch)
            register(IElementEditingPolicy, { sourcePresentation: "touch", canEdit: () => true });
        },
      ],
    });
    await act(async () => {
      root!.render(
        <DndProvider backend={HTML5Backend}>
          <Editor ref={ref} kit={kit} readonly={false} initValue={[paragraphWithMath()]} />
        </DndProvider>
      );
      await vi.dynamicImportSettled();
    });
    editor = ref.current!.getEditor();
  };

  const open = async () => {
    await vi.waitFor(() => {
      expect(host!.querySelector('span[data-slate-node="element"]')).toBeTruthy();
    });
    const math = host!.querySelector('span[data-slate-node="element"]')!;
    await act(async () => (math as HTMLElement).click());
    const source = host!.querySelector<HTMLInputElement>("input[data-inline-math-input]");
    expect(source).toBeTruthy();
    return source!;
  };

  const input = async (input: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  it.each([false, true])("输入即时更新预览，Esc 返回正文（touch=%s）", async touch => {
    await mount(touch);
    const source = await open();
    expect(source.closest("[data-slate-editor]")).toBeTruthy();
    expect(source.value).toBe("x^2");
    await input(source, "y^3");
    expect(host!.querySelector('[aria-label="公式预览"] .katex')).toBeTruthy();
    expect(host!.querySelector('[aria-label="公式预览"]')?.textContent).toContain("y");
    expect(editor.children[0]).toMatchObject({
      children: expect.arrayContaining([
        expect.objectContaining({ type: "inline-math", tex: "y^3" }),
      ]),
    });
    await act(async () => {
      source.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
      );
      await new Promise(resolve => setTimeout(resolve, 30));
    });
    expect(host!.querySelector("input[data-inline-math-input]")).toBeNull();
    expect(editor.selection).toBeTruthy();
  });

  it("源码边界方向键与点按外部都能退出", async () => {
    await mount();
    let source = await open();
    source.setSelectionRange(0, 0);
    await act(async () => {
      source.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true })
      );
      await new Promise(resolve => setTimeout(resolve, 30));
    });
    expect(host!.querySelector("input[data-inline-math-input]")).toBeNull();
    source = await open();
    await act(async () => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(host!.querySelector("input[data-inline-math-input]")).toBeNull();
  });
});
