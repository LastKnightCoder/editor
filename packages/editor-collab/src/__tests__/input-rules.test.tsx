import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { Editor as SlateEditor, Transforms, type Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { describe, expect, it } from "vitest";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import { textFormattingExtension } from "@tau/editor/extensions/text-formatting";
import { createLocalYjsDocument } from "../localDocument";

describe("Y.Doc 文档上的行内输入规则", () => {
  it("转换单独成一个撤销步，撤销回到原始符号", async () => {
    const session = createLocalYjsDocument([
      { type: "paragraph", children: [{ type: "formatted", text: "" }] } as Descendant,
    ]);
    const kit = createEditorKit({ extensions: [textFormattingExtension] });
    const ref = createRef<EditorRef>();
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(
          <DndProvider backend={HTML5Backend}>
            <Editor ref={ref} kit={kit} document={session.document} />
          </DndProvider>
        )
      );
      const editor = ref.current?.getEditor();
      if (!editor) throw new Error("编辑器未挂载");
      await act(async () => {
        Transforms.select(editor, SlateEditor.end(editor, []));
        for (const char of "**粗**") editor.insertText(char);
      });
      expect(session.getContent()).toEqual([
        { type: "paragraph", children: [{ type: "formatted", text: "粗", bold: true }] },
      ]);
      await act(async () => session.undo());
      expect(session.getContent()).toEqual([
        { type: "paragraph", children: [{ type: "formatted", text: "**粗**" }] },
      ]);
    } finally {
      await act(async () => root.unmount());
      host.remove();
      session.dispose();
    }
  });
});
