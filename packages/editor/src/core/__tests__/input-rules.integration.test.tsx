import React, { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { Editor as SlateEditor, Transforms, type Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor, createEditorKit } from "../index";
import { textFormattingExtension } from "@tau/editor/extensions/text-formatting";
import type { EditorRef } from "../types/editor";

describe("真实编辑器的行内输入规则", () => {
  it("输入收尾定界符即转换，后续输入不带新标记，撤销回到原始符号", async () => {
    const kit = createEditorKit({ extensions: [textFormattingExtension] });
    const ref = createRef<EditorRef>();
    const content = [
      { type: "paragraph", children: [{ type: "formatted", text: "" }] },
    ] as Descendant[];
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          <DndProvider backend={HTML5Backend}>
            <Editor ref={ref} kit={kit} initValue={content} />
          </DndProvider>
        )
      );
      const editor = ref.current?.getEditor();
      if (!editor) throw new Error("编辑器未挂载");
      // 每个字符单独一轮，与真实键入一样各自经过 onChange
      const type = async (text: string) => {
        for (const char of text) await act(async () => editor.insertText(char));
      };
      await act(async () => Transforms.select(editor, SlateEditor.end(editor, [])));
      await type("**粗**后");
      expect(editor.children[0]).toEqual({
        type: "paragraph",
        children: [
          { type: "formatted", text: "粗", bold: true },
          { type: "formatted", text: "后" },
        ],
      });
      expect(host.querySelector(".font-bold")?.textContent).toBe("粗");
      await act(async () => editor.undo());
      await act(async () => editor.undo());
      expect(editor.children[0]).toEqual({
        type: "paragraph",
        children: [{ type: "formatted", text: "**粗**" }],
      });
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});
