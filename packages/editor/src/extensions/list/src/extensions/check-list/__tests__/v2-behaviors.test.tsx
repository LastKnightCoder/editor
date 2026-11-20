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

const text = (value: string) => ({ type: "formatted" as const, text: value });
const paragraph = (value: string) => ({ type: "paragraph" as const, children: [text(value)] });

const services = (events: ExtensionErrorEvent[] = []) =>
  [
    register => register(IEditorSlots, createDefaultEditorSlots()),
    register => register(IExtensionErrorReporter, { report: event => events.push(event) }),
  ] satisfies Parameters<typeof createEditorKit>[0]["services"];

describe("内置扩展迁到 v2：check-list 的 Tab 命令", () => {
  it("Tab 把第二项缩进为第一项的子勾选项，shift+Tab 提升", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const ref = createRef<EditorRef>();
    const kit = createEditorKit({ extensions: standardExtensions, services: services() });
    const item = (text: string) => ({
      type: "check-list-item",
      checked: false,
      children: [paragraph(text)],
    });
    await act(async () => {
      root.render(
        <DndProvider backend={HTML5Backend}>
          <Editor
            ref={ref}
            kit={kit}
            readonly={false}
            initValue={[{ type: "check-list", children: [item("一"), item("二")] }] as never}
          />
        </DndProvider>
      );
    });
    const editor = ref.current!.getEditor();
    const entries = kit.assembly.commandHotkeys.filter(entry =>
      entry.hotkey.command.startsWith("tau.check-list.")
    );
    expect(entries).toHaveLength(2);

    Transforms.select(editor, SlateEditor.start(editor, [0, 1, 0]));
    expect(editor.commands.execute("tau.check-list.indent")).toBe(true);
    expect((editor.children[0] as Element).children).toHaveLength(1);
    expect(((editor.children[0] as Element).children[0] as Element).children[1]).toMatchObject({
      type: "check-list",
    });

    // 嵌套项段首 shift+Tab：提升回顶层（中间隔一帧，ReactEditor 的 node→key 映射需要渲染周期同步）
    await act(async () => {});
    Transforms.select(editor, SlateEditor.start(editor, [0, 0, 1, 0]));
    editor.commands.execute("tau.check-list.outdent");
    expect((editor.children[0] as Element).children).toHaveLength(2);
    await act(async () => root.unmount());
    container.remove();
  });
});
