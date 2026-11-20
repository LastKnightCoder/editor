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

describe("内置扩展迁到 v2：detail（插件改写转声明式行为，语义不变）", () => {
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

  it("detail 首段开头退格：unwrap 提出内容", async () => {
    const { editor, done } = await mount([
      {
        type: "detail",
        collapsed: false,
        children: [paragraph("内容"), paragraph("后段")],
      } as never,
    ]);
    Transforms.select(editor, SlateEditor.start(editor, [0, 0]));
    await act(async () => editor.deleteBackward("character"));
    // unwrapNodes split 只提出选区所在段落（与迁移前一致），detail 保留其余子段落
    expect(typesOf(editor)).toEqual(["paragraph", "detail"]);
    expect((editor.children[1] as Element).children).toHaveLength(1);
    await done();
  });

  it("前一个兄弟块是 detail 时段首退格被吞掉，不并入 detail", async () => {
    const { editor, done } = await mount([
      { type: "detail", collapsed: false, children: [paragraph("折叠区")] } as never,
      paragraph("内容"),
    ]);
    Transforms.select(editor, SlateEditor.start(editor, [1]));
    await act(async () => editor.deleteBackward("character"));
    expect(typesOf(editor)).toEqual(["detail", "paragraph"]);
    expect((editor.children[1] as Element).children[0]).toMatchObject({ text: "内容" });
    await done();
  });
});
