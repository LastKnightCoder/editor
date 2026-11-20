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

describe("内置扩展迁到 v2：blockquote（插件改写转声明式行为，语义不变）", () => {
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
      editor: ref.current!.getEditor(),
      done: async () => {
        await act(async () => root.unmount());
        container.remove();
      },
    };
  };

  const typesOf = (editor: ReturnType<EditorRef["getEditor"]>) =>
    editor.children.map(node => (node as Element).type);

  it("段落开头输入 > 加空格：包进 blockquote", async () => {
    const { editor, done } = await mount([paragraph(">")]);
    Transforms.select(editor, { path: [0, 0], offset: 1 });
    await act(async () => editor.insertText(" "));
    expect(typesOf(editor)).toEqual(["blockquote"]);
    expect(SlateEditor.string(editor, [0])).toBe("");
    await done();
  });

  it("普通文本输入不受影响；最后一个空段落回车退出 blockquote", async () => {
    const { editor, done } = await mount([
      { type: "blockquote", children: [paragraph("x"), paragraph("")] } as never,
    ]);
    // 非快捷语法前缀：正常输入
    Transforms.select(editor, SlateEditor.end(editor, [0, 0]));
    await act(async () => editor.insertText(" "));
    expect(SlateEditor.string(editor, [0])).toBe("x ");
    // 最后一个空段落回车：删该段并在下方补空段落
    Transforms.select(editor, SlateEditor.end(editor, [0, 1]));
    await act(async () => editor.insertBreak());
    expect((editor.children[0] as Element).children).toHaveLength(1);
    expect(typesOf(editor)).toEqual(["blockquote", "paragraph"]);
    await done();
  });

  it("裸文本子节点规范化：包进段落", async () => {
    const { editor, done } = await mount([
      { type: "blockquote", children: [text("裸文本")] } as never,
    ]);
    expect((editor.children[0] as Element).children[0]).toMatchObject({ type: "paragraph" });
    await done();
  });
});
