// 内置扩展迁到 v2 的行为回归（用例原文迁自 core/__tests__/define-extension.test.tsx）
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { Editor as SlateEditor, Element, Transforms } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { Editor, createEditorKit } from "@tau/editor";
import type { EditorRef } from "@tau/editor";
import { IExtensionErrorReporter, type ExtensionErrorEvent } from "@tau/editor/core";
import { standardExtensions } from "@tau/editor/presets/standard";
import { createDefaultEditorSlots } from "@tau/editor/extensions/media/slots";
import { IEditorSlots } from "@tau/editor/extensions/media/services";

const paragraph = (value: string) => ({
  type: "paragraph" as const,
  children: [{ type: "formatted" as const, text: value }],
});

const services = (events: ExtensionErrorEvent[] = []) =>
  [
    register => register(IEditorSlots, createDefaultEditorSlots()),
    register => register(IExtensionErrorReporter, { report: event => events.push(event) }),
  ] satisfies Parameters<typeof createEditorKit>[0]["services"];

describe("内置扩展迁到 v2：divide-line", () => {
  it("段落里输入 --- 回车变分割线，下方补空段落", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const ref = createRef<EditorRef>();
    const kit = createEditorKit({ extensions: standardExtensions, services: services() });
    await act(async () => {
      root.render(
        <DndProvider backend={HTML5Backend}>
          <Editor ref={ref} kit={kit} readonly={false} initValue={[paragraph("---")] as never} />
        </DndProvider>
      );
    });
    const editor = ref.current!.getEditor();
    Transforms.select(editor, SlateEditor.end(editor, [0]));
    await act(async () => editor.insertBreak());
    expect(editor.children.map(node => (node as Element).type)).toEqual([
      "divide-line",
      "paragraph",
    ]);
    expect(editor.isVoid(editor.children[0] as Element)).toBe(true);
    expect(container.querySelector('[data-slate-void="true"]')).not.toBeNull();

    // 普通段落回车不受影响
    Transforms.select(editor, SlateEditor.end(editor, [1]));
    await act(async () => editor.insertBreak());
    expect(editor.children).toHaveLength(3);
    await act(async () => root.unmount());
    container.remove();
  });
});
