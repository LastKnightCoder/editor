import { act, createRef, useContext } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { DndContext, DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { UiProvider, usePortalContainer } from "@tau/ui";
import { Node, Transforms, type Descendant } from "slate";
import { expect, it, vi } from "vitest";
import { Editor } from "./Editor";
import { createEditorKit } from "./core/kit/EditorKit";
import { defineElement, defineExtension, type ElementRenderProps } from "./core/api/extension";
import type { EditorRef } from "./core/types/editor";
import { defaultExtensions } from "./presets/default";

type PortalElement = { type: "test.portal"; children: Descendant[] };
declare module "@tau/editor/api" {
  interface ExtensionElementMap {
    "test.portal": PortalElement;
  }
}

it("默认和自定义 kit 均可独立编辑，不要求调用方补齐 Provider", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const change = vi.fn();
  try {
    for (const kit of [undefined, createEditorKit({ extensions: [...defaultExtensions] })]) {
      const ref = createRef<EditorRef>();
      await act(async () =>
        root.render(
          <Editor
            key={kit ? "custom" : "default"}
            ref={ref}
            kit={kit}
            readonly={false}
            initValue={[{ type: "paragraph", children: [{ type: "formatted", text: "正文" }] }]}
            onChange={change}
          />
        )
      );
      expect(container.querySelector('[data-slate-editor="true"]')?.textContent).toContain("正文");
      change.mockClear();
      await act(async () => {
        const editor = ref.current!.getEditor();
        Transforms.select(editor, { path: [0, 0], offset: 2 });
        editor.insertText("更新");
      });
      expect(Node.string(ref.current!.getEditor())).toBe("正文更新");
      expect(change).toHaveBeenCalled();
    }
    expect(document.querySelector(".tau-ui-portals")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it("正文浮层使用默认挂载点，并沿用外层 Portal 和拖拽上下文", async () => {
  const managers: unknown[] = [];
  function Probe({ attributes, children }: ElementRenderProps) {
    const target = usePortalContainer();
    managers.push(useContext(DndContext).dragDropManager);
    return (
      <div {...attributes}>
        {children}
        {createPortal(<span data-editor-probe>正文浮层</span>, target)}
      </div>
    );
  }
  const kit = createEditorKit({
    extensions: [
      defineExtension({
        id: "test.portal",
        elements: [
          defineElement({ type: "test.portal", kind: "block", isVoid: true, render: Probe }),
        ],
      }),
    ],
  });
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const nodes: Descendant[] = [
    { type: "test.portal", children: [{ type: "formatted", text: "" }] },
  ];
  function Outer() {
    managers.push(useContext(DndContext).dragDropManager);
    return <Editor kit={kit} initValue={nodes} />;
  }
  try {
    await act(async () => root.render(<Editor kit={kit} initValue={nodes} />));
    expect(document.body.querySelector(":scope > [data-editor-probe]")).not.toBeNull();
    managers.length = 0;
    await act(async () =>
      root.render(
        <UiProvider theme="test-theme" mode="dark">
          <DndProvider backend={HTML5Backend}>
            <Outer />
          </DndProvider>
        </UiProvider>
      )
    );
    expect(document.querySelectorAll(".tau-ui-portals")).toHaveLength(1);
    expect(
      document.querySelector('.tau-ui-portals[data-theme="test-theme"] [data-editor-probe]')
    ).not.toBeNull();
    expect(managers.length).toBeGreaterThan(1);
    expect(managers.every(manager => manager === managers[0] && manager != null)).toBe(true);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
  expect(document.querySelector("[data-editor-probe]")).toBeNull();
  expect(document.querySelector(".tau-ui-portals")).toBeNull();
});
