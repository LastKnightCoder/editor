// 内置扩展迁到 v2 的行为回归（用例原文迁自 core/__tests__/define-extension.test.tsx）
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { Editor as SlateEditor, Transforms, type Descendant } from "slate";
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

describe("内置扩展迁到 v2：header（热键切命令 id + # 快捷语法）", () => {
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

  const header = (level: number, value = "") =>
    ({ type: "header", level, children: [text(value)] }) as never;

  it("段落开头输入 # 加空格变一级标题；### 变三级", async () => {
    const h1 = await mount([paragraph("#")]);
    Transforms.select(h1.editor, { path: [0, 0], offset: 1 });
    await act(async () => h1.editor.insertText(" "));
    expect(h1.editor.children[0]).toMatchObject({ type: "header", level: 1 });
    await h1.done();

    const h3 = await mount([paragraph("###")]);
    Transforms.select(h3.editor, { path: [0, 0], offset: 3 });
    await act(async () => h3.editor.insertText(" "));
    expect(h3.editor.children[0]).toMatchObject({ type: "header", level: 3 });
    await h3.done();
  });

  it("热键绑命令 id：alt+= 升级（段落变 h6、标题减一级），alt+- 降级（h6 变回段落）", async () => {
    const entries = (await mount([paragraph("x")])).kit.assembly.commandHotkeys;
    expect(entries.filter(entry => entry.hotkey.command.startsWith("tau.header."))).toHaveLength(2);

    const { editor, done } = await mount([header(2, "标题")]);
    // h2 升级 → h1；h1 再升无操作
    Transforms.select(editor, SlateEditor.end(editor, [0]));
    expect(editor.commands.execute("tau.header.promote")).toBe(true);
    expect(editor.children[0]).toMatchObject({ type: "header", level: 1 });
    editor.commands.execute("tau.header.promote");
    expect(editor.children[0]).toMatchObject({ type: "header", level: 1 });
    // h1 降级 → h2；降到 h6 再降变回段落
    editor.commands.execute("tau.header.demote");
    expect(editor.children[0]).toMatchObject({ type: "header", level: 2 });
    for (let round = 0; round < 4; round += 1) editor.commands.execute("tau.header.demote");
    expect(editor.children[0]).toMatchObject({ type: "header", level: 6 });
    editor.commands.execute("tau.header.demote");
    expect(editor.children[0]).toMatchObject({ type: "paragraph" });
    await done();
  });

  it("段落上升级：直接变 h6", async () => {
    const { editor, done } = await mount([paragraph("普通段落")]);
    Transforms.select(editor, SlateEditor.end(editor, [0]));
    expect(editor.commands.execute("tau.header.promote")).toBe(true);
    expect(editor.children[0]).toMatchObject({ type: "header", level: 6 });
    await done();
  });
});
