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

describe("内置扩展迁到 v2：callout（插件改写转声明式行为，语义不变）", () => {
  const callout = (children: Descendant[]) =>
    ({ type: "callout", calloutType: "tip", title: "", children }) as never;

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

  it("第一行的空 callout 退格：删除 callout 落回空段落", async () => {
    const { editor, done } = await mount([callout([paragraph("")])]);
    Transforms.select(editor, SlateEditor.end(editor, [0, 0]));
    await act(async () => editor.deleteBackward("character"));
    // 与迁移前一致：delete 后空文档先被补一个空段落，insertNodes 再插一个（既有行为，不修）
    expect(typesOf(editor)).toEqual(["paragraph", "paragraph"]);
    await done();
  });

  it("非第一行或非空的 callout 退格：行为不接管，交给默认删除", async () => {
    const { editor, done } = await mount([paragraph("前"), callout([paragraph("x")])]);
    Transforms.select(editor, SlateEditor.end(editor, [1, 0]));
    await act(async () => editor.deleteBackward("character"));
    expect(typesOf(editor)).toEqual(["paragraph", "callout"]);
    expect(SlateEditor.string(editor, [1])).toBe("");
    await done();
  });

  it("callout 最后一个空段落回车：删除该段并在 callout 下方补空段落", async () => {
    const { editor, done } = await mount([callout([paragraph("x"), paragraph("")])]);
    Transforms.select(editor, SlateEditor.end(editor, [0, 1]));
    await act(async () => editor.insertBreak());
    expect((editor.children[0] as Element).children).toHaveLength(1);
    expect(typesOf(editor)).toEqual(["callout", "paragraph"]);
    await done();
  });

  it("callout 首个空段落回车：lift 到 callout 外，callout 随之移除", async () => {
    const { editor, done } = await mount([callout([paragraph("")])]);
    Transforms.select(editor, SlateEditor.end(editor, [0, 0]));
    await act(async () => editor.insertBreak());
    expect(typesOf(editor)).toEqual(["paragraph"]);
    await done();
  });

  it("裸文本子节点规范化：包进段落；空 callout 移除", async () => {
    const bare = await mount([callout([text("裸文本")])]);
    expect((bare.editor.children[0] as Element).children[0]).toMatchObject({ type: "paragraph" });
    await bare.done();

    const empty = await mount([callout([])]);
    expect(typesOf(empty.editor)).toEqual(["paragraph"]);
    await empty.done();
  });
});
