import React, { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { Editor as SlateEditor, Transforms, type Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import { createDefaultEditorSlots, IEditorSlots } from "@tau/editor/src/services";
import codeBlockExtension from "../index";

describe("代码块行为随包迁移", () => {
  const mount = async (initValue: Descendant[]) => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const ref = createRef<EditorRef>();
    const kit = createEditorKit({
      extensions: [codeBlockExtension],
      services: [register => register(IEditorSlots, createDefaultEditorSlots())],
    });
    await act(async () =>
      root.render(
        <React.Fragment>
          <DndProvider backend={HTML5Backend}>
            <Editor ref={ref} kit={kit} readonly={false} initValue={initValue} />
          </DndProvider>
        </React.Fragment>
      )
    );
    return {
      kit,
      editor: ref.current!.getEditor(),
      done: async () => {
        await act(async () => root.unmount());
        container.remove();
      },
    };
  };
  it("围栏快捷语法与原命令 ID 保持", async () => {
    const paragraph = (text: string): Descendant => ({
      type: "paragraph",
      children: [{ type: "formatted", text }],
    });
    const fence = await mount([paragraph("```ts")]);
    expect(
      fence.kit.assembly.commandHotkeys.filter(entry =>
        entry.hotkey.command.startsWith("tau.code-block.")
      )
    ).toHaveLength(1);
    await act(async () => {
      Transforms.select(fence.editor, SlateEditor.end(fence.editor, [0]));
      fence.editor.insertBreak();
    });
    expect(fence.editor.children[0]).toMatchObject({ type: "code-block", language: "ts" });
    await fence.done();
    const hotkey = await mount([paragraph("")]);
    await act(async () => {
      Transforms.select(hotkey.editor, SlateEditor.end(hotkey.editor, [0]));
      expect(hotkey.editor.commands?.execute("tau.code-block.insert")).toBe(true);
    });
    expect(hotkey.editor.children[0]).toMatchObject({ type: "code-block", language: "javascript" });
    await hotkey.done();
  });
});
