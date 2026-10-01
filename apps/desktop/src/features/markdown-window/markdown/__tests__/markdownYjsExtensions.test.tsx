import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { expect, it } from "vitest";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import codeBlockExtension from "@tau/editor-code-block";
import { getCodeBlockController } from "@tau/editor-code-block/runtime";
import { createMarkdownDocument } from "../markdownDocument";

it("真实代码块在文件增量更新后保留控制器，编辑仍回写同一 Y.Doc", async () => {
  const raw = "正文\n\n```js\nconst x = 1;\n```\n";
  const file = createMarkdownDocument();
  file.applyMarkdown(raw, "external");
  const kit = createEditorKit({ extensions: [codeBlockExtension] });
  const ref = createRef<EditorRef>();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          <Editor ref={ref} kit={kit} document={file.document} readonly={false} />
        </DndProvider>
      )
    );
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 350));
    });
    const editor = ref.current?.getEditor();
    const block = editor?.children[1];
    if (!editor || block?.type !== "code-block") throw new Error("代码块未挂载");
    const controller = getCodeBlockController(block.uuid);
    const textarea = host.querySelector("textarea");
    expect(controller?.getValue()).toBe("const x = 1;");
    expect(file.getText()).toBe(raw);
    await act(async () => {
      file.applyMarkdown("新增\n\n" + raw, "external");
    });
    expect(editor.children[2]).toBe(block);
    expect(host.querySelector("textarea")).toBe(textarea);
    expect(getCodeBlockController(block.uuid)).toBe(controller);
    if (!textarea) throw new Error("代码输入器未挂载");
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      if (!setValue) throw new Error("缺少输入器 value setter");
      setValue.call(textarea, "const x = 2;");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(file.getContent()[2]).toMatchObject({ uuid: block.uuid, code: "const x = 2;" });
    expect(file.getText()).toContain("const x = 2;");
    await act(async () => file.undo());
    expect(controller?.getValue()).toBe("const x = 1;");
    expect(file.getText()).toBe("新增\n\n" + raw);
  } finally {
    await act(async () => root.unmount());
    file.dispose();
    host.remove();
  }
});
