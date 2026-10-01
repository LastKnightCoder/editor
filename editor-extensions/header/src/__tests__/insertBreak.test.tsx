// 标题回车的声明式行为等价测试（原 plugins/insertBreak 的单测，装配换成真实 kit 的行为分发）
import { createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { Editor as SlateEditor, Transforms, type Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { Editor, createEditorKit } from "@tau/editor";
import headerExtension from "..";
import type { EditorRef } from "@tau/editor";
import { createDefaultEditorSlots } from "@tau/editor-media/slots";
import { IEditorSlots } from "@tau/editor-media/services";

const createParagraph = (text: string) => ({
  type: "paragraph" as const,
  children: [{ type: "formatted" as const, text }],
});

const createHeader = (text: string, options?: { collapsed?: boolean }) => ({
  type: "header" as const,
  level: 2 as const,
  ...(options?.collapsed ? { collapsed: true } : {}),
  children: [{ type: "formatted" as const, text }],
});

const mount = async (initValue: Descendant[]) => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const ref = createRef<EditorRef>();
  const kit = createEditorKit({
    extensions: [headerExtension],
    services: [register => register(IEditorSlots, createDefaultEditorSlots())],
  });
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

const selectText = async (
  editor: ReturnType<EditorRef["getEditor"]>,
  path: number[],
  offset: number
) => {
  const point = { path: [...path], offset };
  await act(async () => {
    Transforms.select(editor, { anchor: point, focus: point });
  });
};

describe("header insertBreak 行为", () => {
  it("标题中间按回车时拆出的后半应变成段落", async () => {
    const { editor, done } = await mount([createHeader("这是一个段落")]);

    await selectText(editor, [0, 0], 2);
    await act(async () => editor.insertBreak());

    expect(editor.children).toEqual([createHeader("这是"), createParagraph("一个段落")]);
    expect(editor.selection).toEqual({
      anchor: { path: [1, 0], offset: 0 },
      focus: { path: [1, 0], offset: 0 },
    });
    await done();
  });

  it("标题末尾按回车时仍应在下方插入空段落", async () => {
    const { editor, done } = await mount([createHeader("这是一个段落")]);

    await selectText(editor, [0, 0], "这是一个段落".length);
    await act(async () => editor.insertBreak());

    expect(editor.children).toEqual([createHeader("这是一个段落"), createParagraph("")]);
    expect(editor.selection).toEqual({
      anchor: { path: [1, 0], offset: 0 },
      focus: { path: [1, 0], offset: 0 },
    });
    await done();
  });

  it("收起标题在行首按回车时应在上方插入空段落并保持收起", async () => {
    const { editor, done } = await mount([
      createHeader("这是一个段落", { collapsed: true }),
      createParagraph("被收起的内容"),
    ]);

    await selectText(editor, [0, 0], 0);
    await act(async () => editor.insertBreak());

    expect(editor.children).toEqual([
      createParagraph(""),
      createHeader("这是一个段落", { collapsed: true }),
      createParagraph("被收起的内容"),
    ]);
    expect(editor.selection).toEqual({
      anchor: { path: [1, 0], offset: 0 },
      focus: { path: [1, 0], offset: 0 },
    });
    await done();
  });
});
