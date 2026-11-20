// 内置扩展迁到 v2 的行为回归（用例原文迁自 core/__tests__/define-extension.test.tsx）
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { Element, Transforms, type Descendant } from "slate";
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

describe("内置扩展迁到 v2：列表（插件改写转声明式行为，语义不变）", () => {
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

  const listItem = (value: string) => ({ type: "list-item", children: [paragraph(value)] });

  it("段落开头输入 - 加空格：包进无序列表；输入 1. 加空格：包进有序列表", async () => {
    const bullet = await mount([paragraph("-")]);
    Transforms.select(bullet.editor, { path: [0, 0], offset: 1 });
    await act(async () => bullet.editor.insertText(" "));
    expect(typesOf(bullet.editor)).toEqual(["bulleted-list"]);
    expect((bullet.editor.children[0] as Element).children[0]).toMatchObject({ type: "list-item" });
    await bullet.done();

    const numbered = await mount([paragraph("1.")]);
    Transforms.select(numbered.editor, { path: [0, 0], offset: 2 });
    await act(async () => numbered.editor.insertText(" "));
    expect(typesOf(numbered.editor)).toEqual(["numbered-list"]);
    await numbered.done();
  });

  it("相邻同类列表规范化合并；非 list-item 子节点包进 list-item", async () => {
    const merge = await mount([
      { type: "bulleted-list", children: [listItem("a")] } as never,
      { type: "bulleted-list", children: [listItem("b")] } as never,
    ]);
    expect(typesOf(merge.editor)).toEqual(["bulleted-list"]);
    expect((merge.editor.children[0] as Element).children).toHaveLength(2);
    await merge.done();

    const wrap = await mount([{ type: "numbered-list", children: [paragraph("裸")] } as never]);
    expect((wrap.editor.children[0] as Element).children[0]).toMatchObject({ type: "list-item" });
    await wrap.done();
  });
});
