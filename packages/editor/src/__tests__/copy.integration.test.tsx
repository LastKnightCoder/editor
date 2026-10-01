import { IOpenerService } from "@tau/shared/host-services";
import React, { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Transforms, type Descendant, type Editor as SlateEditor } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor, createEditorKit, type EditorKit } from "../index";
import type { EditorDocument } from "../document/EditorDocument";
import type { EditorRef } from "../types/editor";
import { defineExtension } from "../api";
import { createDefaultEditorSlots } from "@tau/editor-media/slots";
import { IEditorSlots } from "@tau/editor-media/services";

describe("真实编辑器的复制贡献接线", () => {
  let root: Root | null = null;
  let host: HTMLDivElement | null = null;
  afterEach(async () => {
    if (root) await act(async () => root?.unmount());
    root = null;
    host?.remove();
    host = null;
  });

  it("只读复制、服务派生和同谱系换源只处理一次，包装位于 binding 之后", async () => {
    const policy = vi.fn(() => "unwrap" as const);
    const kit = createEditorKit({
      extensions: [
        defineExtension({
          id: "test.copy-box",
          elements: [
            {
              type: "copy-box",
              kind: "block",
              copy: policy,
              render: ({ attributes, children }) => <div {...attributes}>{children}</div>,
            },
          ],
        }),
      ],
      services: [register => register(IEditorSlots, createDefaultEditorSlots())],
    });
    const value = [
      {
        type: "copy-box",
        children: [{ type: "paragraph", children: [{ type: "formatted", text: "abcdef" }] }],
      },
    ] as unknown as Descendant[];
    const upstream = vi.fn();
    let rewrite = false;
    const rewritten = [
      { type: "paragraph", children: [{ type: "formatted", text: "binding 结果" }] },
    ] as Descendant[];
    const install = vi.fn((editor: SlateEditor) => {
      const original = editor.getFragment;
      editor.getFragment = () => {
        upstream();
        return rewrite ? rewritten : original();
      };
      return editor;
    });
    const first: EditorDocument = {
      lineage: "copy-lineage",
      history: "slate",
      initialValue: value,
      binding: { install, connect: vi.fn(), disconnect: vi.fn(), rebind: () => true },
    };
    const rebind = vi.fn(() => true);
    const second: EditorDocument = {
      ...first,
      binding: { install, connect: vi.fn(), disconnect: vi.fn(), rebind },
    };
    const ref = createRef<EditorRef>();
    host = document.createElement("div");
    document.body.appendChild(host);
    const mountedRoot = createRoot(host);
    root = mountedRoot;
    const render = async (current: EditorKit, document: EditorDocument) => {
      await act(async () =>
        mountedRoot.render(
          <DndProvider backend={HTML5Backend}>
            <Editor ref={ref} kit={current} document={document} readonly />
          </DndProvider>
        )
      );
    };
    await render(kit, first);
    const editor = ref.current?.getEditor();
    if (!editor) throw new Error("编辑器未挂载");
    await act(async () =>
      Transforms.select(editor, {
        anchor: { path: [0, 0, 0], offset: 1 },
        focus: { path: [0, 0, 0], offset: 4 },
      })
    );
    const copy = editor.getFragment;
    const expected = [{ type: "paragraph", children: [{ type: "formatted", text: "bcd" }] }];
    expect(editor.getFragment()).toEqual(expected);
    expect(policy).toHaveBeenCalledTimes(1);
    const derived = kit.extend({
      services: [register => register(IOpenerService, { open: vi.fn() })],
    });
    await render(derived, first);
    expect(ref.current?.getEditor()).toBe(editor);
    expect(editor.getFragment).toBe(copy);
    expect(editor.getFragment()).toEqual(expected);
    expect(policy).toHaveBeenCalledTimes(2);
    await render(derived, second);
    expect(ref.current?.getEditor()).toBe(editor);
    expect(editor.getFragment).toBe(copy);
    expect(editor.getFragment()).toEqual(expected);
    expect(policy).toHaveBeenCalledTimes(3);
    expect(install).toHaveBeenCalledTimes(1);
    expect(rebind).toHaveBeenCalledTimes(1);
    rewrite = true;
    expect(editor.getFragment()).toBe(rewritten);
    expect(policy).toHaveBeenCalledTimes(3);
    expect(upstream).toHaveBeenCalledTimes(4);
    expect(editor.children).toEqual(value);
  });
});
