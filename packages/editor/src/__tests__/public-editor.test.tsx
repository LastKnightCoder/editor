import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { Editor, type EditorRef, createEditorKit, defaultExtensions } from "../index";
import { IEditorInteraction } from "../../api";

it("默认组件无需 Kit 或宿主 Provider，多实例正文与卸载相互独立", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const first = createRef<EditorRef>();
  const second = createRef<EditorRef>();
  const content = [
    { type: "paragraph" as const, children: [{ type: "formatted" as const, text: "独立正文" }] },
  ];
  const render = (showFirst: boolean) =>
    root.render(
      <>
        {showFirst && <Editor key="first" ref={first} initValue={content} readonly />}
        <Editor key="second" ref={second} initValue={content} readonly />
      </>
    );
  try {
    await act(async () => render(true));
    expect(container.querySelectorAll('[data-slate-editor="true"]')).toHaveLength(2);
    expect(first.current!.getEditor()).not.toBe(second.current!.getEditor());
    expect(first.current!.getEditor().children).not.toBe(content);
    const remaining = second.current!.getEditor();
    await act(async () => render(false));
    expect(second.current!.getEditor()).toBe(remaining);
    expect(container.textContent).toContain("独立正文");
    expect(document.documentElement.getAttribute("data-theme")).toBeNull();
    const types = defaultExtensions.flatMap(extension =>
      "elements" in extension ? (extension.elements?.map(element => element.type) ?? []) : []
    );
    expect(types).not.toContain("html-block");
    expect(types).not.toContain("typst");
    expect(types).not.toContain("abc");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it("触屏宿主不装载桌面块拖拽控件，切回鼠标交互仍可拖拽", async () => {
  // Android 点正文会保留 hover；桌面把手曾与移动端选块把手重叠。
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const content = [
    { type: "paragraph" as const, children: [{ type: "formatted" as const, text: "可编辑正文" }] },
  ];
  try {
    for (const touch of [false, true, false]) {
      const kit = createEditorKit({
        services: [register => register(IEditorInteraction, { touch })],
      });
      await act(async () => root.render(<Editor kit={kit} initValue={content} readonly={false} />));
      const editable = container.querySelector('[data-slate-editor="true"]');
      expect(editable?.getAttribute("contenteditable")).toBe("true");
      expect(editable?.textContent).toContain("可编辑正文");
      if (touch) {
        expect(container.querySelector("[data-drag-handle]")).toBeNull();
      } else {
        expect(container.querySelector("[data-drag-handle]")).not.toBeNull();
      }
    }
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
