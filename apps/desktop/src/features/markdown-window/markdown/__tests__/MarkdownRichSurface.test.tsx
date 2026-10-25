import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { expect, it } from "vitest";
import { createEditorKit, type EditorRef } from "@tau/editor";
import codeBlockExtension from "@tau/editor/extensions/code-block";
import { getCodeBlockController } from "@tau/editor/extensions/code-block/runtime";
import { MarkdownRichSurface } from "../MarkdownRichSurface";
import { createMarkdownDocument } from "../markdownDocument";
import { createMarkdownContentPreparer } from "../prepareMarkdownContent";

it("首屏卸载不会删除完整代码块控制器，编辑、撤销及源码光标控制器仍可用", async () => {
  const kit = createEditorKit({ extensions: [codeBlockExtension] });
  const file = createMarkdownDocument(undefined, createMarkdownContentPreparer(kit));
  file.applyMarkdown(
    ["开头", "```js\nconst x = 1;\n```", ...Array.from({ length: 150 }, (_, i) => `正文${i}`)].join(
      "\n\n"
    ),
    "external"
  );
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host),
    ref = createRef<EditorRef>();
  const block = file.getContent()[1];
  if (block.type !== "code-block") throw new Error("缺少代码块");
  try {
    await act(async () =>
      root.render(
        <DndProvider backend={HTML5Backend}>
          <MarkdownRichSurface
            kit={kit}
            document={file.document}
            content={file.getSnapshot().content}
            editorRef={ref}
            scrollEl={null}
            suspended={false}
            onStateChange={() => undefined}
          />
        </DndProvider>
      )
    );
    window.dispatchEvent(new MouseEvent("pointerdown"));
    for (let attempt = 0; attempt < 40; attempt++) {
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });
      if (
        getCodeBlockController(block.uuid) &&
        host.querySelector("[data-markdown-first-screen] textarea")
      )
        break;
    }
    const controller = getCodeBlockController(block.uuid);
    expect(controller?.getValue()).toBe("const x = 1;");
    expect(host.querySelector("[data-markdown-first-screen] textarea")).not.toBeNull();
    window.dispatchEvent(new MouseEvent("pointerup"));
    for (
      let attempt = 0;
      attempt < 40 && !host.querySelector('[data-markdown-full-editor="ready"]');
      attempt++
    ) {
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });
    }
    expect(host.querySelector('[data-markdown-full-editor="ready"]')).not.toBeNull();
    expect(getCodeBlockController(block.uuid)).toBe(controller);
    const textarea = host.querySelector("[data-markdown-full-editor] textarea");
    if (!textarea) throw new Error("缺少完整代码输入器");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(textarea, "const x = 2;");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    // 代码块数据版本 2：源码在代码步骤子节点上
    expect(file.getContent()[1]).toMatchObject({
      uuid: block.uuid,
      children: [{ type: "code-step", code: "const x = 2;" }],
    });
    await act(async () => file.undo());
    expect(controller?.getValue()).toBe("const x = 1;");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    file.dispose();
  }
});
