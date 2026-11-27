import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Editor as SlateEditor, Transforms } from "slate";
import { Editor, createEditorKit, type EditorRef } from "@tau/editor";
import { describe, expect, it, vi } from "vitest";
import { desktopLocaleSource } from "@/app/i18n/runtime";
import flashcardBlankExtension from "..";
import type { FlashcardBlankElement } from "../types";

function change(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setter) throw new Error("Input value setter unavailable");
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("填空配置草稿生命周期", () => {
  it("换语保留编辑器、焦点与未保存答案，只在保存时写入原始草稿", async () => {
    const locale = desktopLocaleSource.getSnapshot();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    const ref = createRef<EditorRef>();
    const kit = createEditorKit({ extensions: [flashcardBlankExtension] });
    const blank: FlashcardBlankElement = {
      type: "flashcard-blank",
      blankId: "blank-original",
      uuid: "node-original",
      placeholder: "原提示",
      answer: "原答案",
      alternativeAnswers: ["原备选"],
      children: [{ type: "formatted", text: "原正文" }],
    };
    try {
      await act(async () => {
        root.render(
          <DndProvider backend={HTML5Backend}>
            <Editor
              ref={ref}
              kit={kit}
              initValue={[
                {
                  type: "paragraph",
                  children: [
                    { type: "formatted", text: "之前 " },
                    blank,
                    { type: "formatted", text: " 之后" },
                  ],
                },
              ]}
            />
          </DndProvider>
        );
      });
      const editor = ref.current?.getEditor();
      if (!editor) throw new Error("Editor not mounted");
      const icon = container.querySelector(".blank-config-icon");
      if (!(icon instanceof HTMLElement)) throw new Error("Blank control not mounted");
      await act(async () => {
        Transforms.select(editor, SlateEditor.end(editor, [0, 0]));
        icon.click();
      });
      const panel = container.querySelector(".blank-config-popover");
      if (!panel) throw new Error("Blank configuration not mounted");
      const inputs = [...panel.querySelectorAll("input")];
      const [hint, answer, alternative] = inputs;
      if (!hint || !answer || !alternative) throw new Error("Blank inputs unavailable");
      await act(async () => {
        change(hint, "  使用者提示  ");
        change(answer, "  User answer 答案  ");
        change(alternative, "  Alternative 原文  ");
        answer.focus();
        answer.setSelectionRange(2, 7);
      });
      await act(async () => {
        await vi.waitFor(() => expect(editor.selection).toBeNull());
      });
      const nodes = editor.children;
      const selection = structuredClone(editor.selection);
      const apply = vi.spyOn(editor, "apply");
      for (const language of ["zh-TW", "en-US"]) {
        await act(async () => desktopLocaleSource.setLocale(language));
        expect(ref.current?.getEditor()).toBe(editor);
        expect(container.querySelector(".blank-config-popover")).toBe(panel);
        expect([...panel.querySelectorAll("input")]).toEqual(inputs);
        expect(document.activeElement).toBe(answer);
        expect(answer.selectionStart).toBe(2);
        expect(answer.selectionEnd).toBe(7);
        expect(hint.value).toBe("  使用者提示  ");
        expect(answer.value).toBe("  User answer 答案  ");
        expect(alternative.value).toBe("  Alternative 原文  ");
        expect(editor.children).toBe(nodes);
        expect(editor.selection).toEqual(selection);
        expect(apply).not.toHaveBeenCalled();
      }
      const save = panel.querySelector(".button-primary");
      if (!(save instanceof HTMLButtonElement)) throw new Error("Save control unavailable");
      await act(async () => save.click());
      expect(container.querySelector(".blank-config-popover")).toBeNull();
      expect(SlateEditor.node(editor, [0, 1])[0]).toMatchObject({
        type: "flashcard-blank",
        blankId: "blank-original",
        uuid: "node-original",
        placeholder: "使用者提示",
        answer: "User answer 答案",
        alternativeAnswers: ["Alternative 原文"],
        children: [{ type: "formatted", text: "原正文" }],
      });
      expect(apply.mock.calls.filter(([op]) => op.type === "set_node")).toHaveLength(1);
      apply.mockRestore();
    } finally {
      await act(async () => root.unmount());
      container.remove();
      await act(async () => desktopLocaleSource.setLocale(locale));
    }
  });
});
