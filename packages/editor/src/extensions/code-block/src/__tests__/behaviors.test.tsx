import { createI18nRuntime, createLocaleStore } from "@tau/i18n";
import { I18nRuntimeProvider } from "@tau/i18n/react";
import CodeBlockHeader from "../extensions/code-block/components/CodeBlock/CodeBlockHeader";
import React, { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { Editor as SlateEditor, Transforms, type Descendant } from "slate";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import { createDefaultEditorSlots } from "@tau/editor/extensions/media/slots";
import { IEditorSlots } from "@tau/editor/extensions/media/services";
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

it("切换语言保留代码文件名草稿与光标，只在原提交动作后保存", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const locale = createLocaleStore("zh-CN");
  const runtime = createI18nRuntime({ localeSource: locale });
  const commit = vi.fn();
  try {
    await act(async () =>
      root.render(
        <I18nRuntimeProvider runtime={runtime}>
          <CodeBlockHeader
            language="Plain Text"
            onLanguageChange={vi.fn()}
            readOnly={false}
            filename="original.ts"
            editingFilename
            onEditFilename={vi.fn()}
            onFilenameCommit={commit}
            steps={null}
            copied={false}
            onCopy={vi.fn()}
          />
        </I18nRuntimeProvider>
      )
    );
    const input = container.querySelector("input");
    if (!input) throw new Error("文件名输入框未挂载");
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
        input,
        "draft-file.ts"
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
    });
    input.setSelectionRange(2, 6);
    for (const next of ["zh-TW", "en-US"]) {
      await act(async () => locale.setLocale(next));
      expect(container.querySelector("input")).toBe(input);
      expect(input.value).toBe("draft-file.ts");
      expect(document.activeElement).toBe(input);
      expect([input.selectionStart, input.selectionEnd]).toEqual([2, 6]);
      expect(commit).not.toHaveBeenCalled();
    }
    await act(async () => input.blur());
    expect(commit).toHaveBeenCalledExactlyOnceWith("draft-file.ts");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    runtime.dispose();
  }
});
