// 标题退格的声明式行为等价测试（原 plugins/deleteBackward 的单测，装配换成真实 kit 的行为分发）
import { createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor as SlateEditor, Transforms, type Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { Editor, createEditorKit } from "@tau/editor";
import headerExtension from "..";
import type { EditorRef } from "@tau/editor";
import { IExtensionErrorReporter, type ExtensionErrorEvent } from "@tau/editor";
import { createDefaultEditorSlots } from "@tau/editor/extensions/media/slots";
import { IEditorSlots } from "@tau/editor/extensions/media/services";

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
  const events: ExtensionErrorEvent[] = [];
  const kit = createEditorKit({
    extensions: [headerExtension],
    services: [
      register => register(IEditorSlots, createDefaultEditorSlots()),
      register => register(IExtensionErrorReporter, { report: event => events.push(event) }),
    ],
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
    events,
    done: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
};

const selectTextStart = async (editor: ReturnType<EditorRef["getEditor"]>, path: number[]) => {
  const point = SlateEditor.start(editor, path);
  await act(async () => {
    Transforms.select(editor, { anchor: point, focus: point });
  });
};

describe("header deleteBackward 行为", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("非空标题在行首退格时应移动到上一个块末尾并保持标题状态", async () => {
    const { editor, done } = await mount([
      createParagraph("前文"),
      createHeader("标题", { collapsed: true }),
      createParagraph("内容"),
    ]);

    await selectTextStart(editor, [1]);
    await act(async () => editor.deleteBackward("character"));

    expect(editor.children).toEqual([
      createParagraph("前文"),
      createHeader("标题", { collapsed: true }),
      createParagraph("内容"),
    ]);
    expect(editor.selection).toEqual({
      anchor: { path: [0, 0], offset: 2 },
      focus: { path: [0, 0], offset: 2 },
    });
    await done();
  });

  it("收起标题后的段落在行首退格时不应并入标题", async () => {
    const { editor, done } = await mount([
      createHeader("标题", { collapsed: true }),
      createParagraph("内容"),
      createParagraph("尾部"),
    ]);

    await selectTextStart(editor, [1]);
    await act(async () => editor.deleteBackward("character"));

    expect(editor.children).toEqual([
      createHeader("标题", { collapsed: true }),
      createParagraph("内容"),
      createParagraph("尾部"),
    ]);
    expect(editor.selection).toEqual({
      anchor: { path: [0, 0], offset: 2 },
      focus: { path: [0, 0], offset: 2 },
    });
    await done();
  });

  it("标题自身在行首退格时仍应转换为段落", async () => {
    const { editor, done } = await mount([
      createHeader("", { collapsed: true }),
      createParagraph("内容"),
    ]);

    await selectTextStart(editor, [0]);
    await act(async () => editor.deleteBackward("character"));

    expect(editor.children).toEqual([createParagraph(""), createParagraph("内容")]);
    expect(editor.selection).toEqual({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 0 },
    });
    await done();
  });
});
