import { IOpenerService } from "@tau/shared/host-services";
import React, { act, createRef, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { Transforms, type Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor, createEditorKit, type EditorKit } from "../index";
import { textFormattingExtension } from "@tau/editor-text-formatting";
import { defineExtension, type MarkRenderProps } from "../api";
import type { EditorRef } from "../types/editor";
import { createDefaultEditorSlots } from "@tau/editor-media/slots";
import { IEditorSlots } from "@tau/editor-media/services";

function CustomMark({ leaf, children }: MarkRenderProps) {
  const label = useMemo(() => leaf.text, [leaf.text]);
  return <span data-custom-mark={label}>{children}</span>;
}
function HostWrapper({ children }: MarkRenderProps) {
  return <span data-host-wrapper>{children}</span>;
}

describe("真实编辑器的标记与命令", () => {
  it("扩展组件可用 hook，宿主包装不跳过格式，服务派生与只读更新保持文档", async () => {
    const kit = createEditorKit({
      extensions: [
        textFormattingExtension,
        defineExtension({
          id: "test.external-mark",
          marks: [{ id: "test.note", keys: ["note"], render: CustomMark }],
        }),
      ],
      services: [register => register(IEditorSlots, createDefaultEditorSlots())],
    });
    const ref = createRef<EditorRef>();
    const content = [
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "alpha", bold: true, note: "保留" }],
      },
    ] as unknown as Descendant[];
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const render = async (current: EditorKit, readonly = false) =>
      act(async () =>
        root.render(
          <DndProvider backend={HTML5Backend}>
            <Editor
              ref={ref}
              kit={current}
              initValue={content}
              readonly={readonly}
              leafWrapper={HostWrapper}
            />
          </DndProvider>
        )
      );
    try {
      await render(kit);
      const editor = ref.current?.getEditor();
      if (!editor) throw new Error("编辑器未挂载");
      expect(host.querySelectorAll("[data-slate-leaf]")).toHaveLength(1);
      expect(
        host.querySelector(
          '[data-slate-leaf] > [data-host-wrapper] > [data-custom-mark="alpha"] .font-bold'
        )?.textContent
      ).toBe("alpha");
      await act(async () => {
        Transforms.select(editor, {
          anchor: { path: [0, 0], offset: 0 },
          focus: { path: [0, 0], offset: 5 },
        });
        expect(editor.commands?.execute("tau.mark.italic")).toBe(true);
      });
      expect(host.querySelector(".font-bold.italic")?.textContent).toBe("alpha");
      expect(JSON.stringify(editor.children)).toContain('"note":"保留"');
      const derived = kit.extend({
        services: [register => register(IOpenerService, { open: () => undefined })],
      });
      await render(derived, true);
      expect(ref.current?.getEditor()).toBe(editor);
      const before = editor.children;
      expect(editor.commands?.execute("tau.mark.bold")).toBe(false);
      expect(editor.children).toBe(before);
      expect(host.querySelector(".font-bold.italic")).toBeTruthy();
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});
