// 内置扩展迁到 v2 的行为回归（用例原文迁自 core/__tests__/define-extension.test.tsx）
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { Editor as SlateEditor, Element, Transforms, type Descendant } from "slate";
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

describe("内置扩展迁到 v2：list-item（行为 + 热键切命令 id）", () => {
  const mount = async (initValue: Descendant[]) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const ref = createRef<EditorRef>();
    const kit = createEditorKit({ extensions: standardExtensions, services: services() });
    await act(async () => {
      root.render(
        <DndProvider backend={HTML5Backend}>
          <Editor ref={ref} kit={kit} readonly={false} initValue={initValue} />
        </DndProvider>
      );
    });
    return {
      kit,
      editor: ref.current!.getEditor(),
      done: async () => {
        await act(async () => root.unmount());
        container.remove();
      },
    };
  };

  const listItem = (value: string) => ({ type: "list-item", children: [paragraph(value)] });
  const bulleted = (...items: ReturnType<typeof listItem>[]) =>
    ({ type: "bulleted-list", children: items }) as never;

  it("空列表项回车：退出列表转为段落", async () => {
    const { editor, done } = await mount([bulleted(listItem(""))]);
    Transforms.select(editor, { path: [0, 0, 0, 0], offset: 0 });
    await act(async () => editor.insertBreak());
    expect(editor.children[0]).toMatchObject({ type: "paragraph" });
    await done();
  });

  it("列表项段首退格：唯一项时解包整个列表", async () => {
    const { editor, done } = await mount([bulleted(listItem("内容"))]);
    Transforms.select(editor, SlateEditor.start(editor, [0, 0, 0]));
    await act(async () => editor.deleteBackward("character"));
    expect(editor.children[0]).toMatchObject({ type: "paragraph" });
    await done();
  });

  it("Tab 缩进第二项到第一项内；shift+Tab 提升回来", async () => {
    const { kit, editor, done } = await mount([bulleted(listItem("一"), listItem("二"))]);
    const entries = kit.assembly.commandHotkeys;
    expect(entries.filter(entry => entry.hotkey.command.startsWith("tau.list-item."))).toHaveLength(
      4
    );

    // 第二项段首 Tab：成为第一项的子项
    Transforms.select(editor, SlateEditor.start(editor, [0, 1, 0]));
    expect(editor.commands.execute("tau.list-item.indent")).toBe(true);
    expect((editor.children[0] as Element).children).toHaveLength(1);
    expect((editor.children[0] as Element).children[0]).toMatchObject({ type: "list-item" });
    const nested = (editor.children[0] as Element).children[0] as Element;
    expect(nested.children[1]).toMatchObject({ type: "bulleted-list" });

    // 嵌套项段首 shift+Tab：提升回顶层（中间隔一帧，ReactEditor 的 node→key 映射需要渲染周期同步）
    await act(async () => {});
    Transforms.select(editor, SlateEditor.start(editor, [0, 0, 1, 0]));
    editor.commands.execute("tau.list-item.outdent");
    expect((editor.children[0] as Element).children).toHaveLength(2);
    await done();
  });

  it("mod+↑/↓ 在同级内移动列表项", async () => {
    const { editor, done } = await mount([bulleted(listItem("一"), listItem("二"))]);
    Transforms.select(editor, SlateEditor.end(editor, [0, 1, 0]));
    expect(editor.commands.execute("tau.list-item.move-up")).toBe(true);
    expect(SlateEditor.string(editor, [0, 0])).toBe("二");
    expect(editor.commands.execute("tau.list-item.move-down")).toBe(true);
    expect(SlateEditor.string(editor, [0, 0])).toBe("一");
    // 已在最上时无操作（选区移到第一项）
    Transforms.select(editor, SlateEditor.end(editor, [0, 0]));
    editor.commands.execute("tau.list-item.move-up");
    expect(SlateEditor.string(editor, [0, 0])).toBe("一");
    await done();
  });
});
