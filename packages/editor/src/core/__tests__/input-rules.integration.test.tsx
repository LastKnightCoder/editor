import React, { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { Editor as SlateEditor, Transforms, type Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor, createEditorKit } from "../index";
import { textFormattingExtension } from "@tau/editor/extensions/text-formatting";
import { mathExtensions } from "@tau/editor/extensions/math";
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

  it("输入 $x$ 变成行内公式，光标落在公式之后继续输入", async () => {
    const kit = createEditorKit({ extensions: [textFormattingExtension, ...mathExtensions] });
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
      await act(async () => Transforms.select(editor, SlateEditor.end(editor, [])));
      for (const char of "设$x^2$为") await act(async () => editor.insertText(char));
      const paragraph = editor.children[0] as { children: Record<string, unknown>[] };
      expect(paragraph.children.find(child => child.type === "inline-math")).toMatchObject({
        tex: "x^2",
      });
      expect(SlateEditor.string(editor, []).replace(/\uFEFF/g, "")).toBe("设为");
      const last = paragraph.children[paragraph.children.length - 1];
      expect(String(last.text).replace(/\uFEFF/g, "")).toBe("为");
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});
