import { createEditor, Descendant } from "slate";
import { describe, expect, it, vi } from "vitest";

import { updateNodeRecursively } from "../editor";

const createParagraph = (text: string) =>
  ({
    type: "paragraph",
    children: [{ type: "formatted", text }],
  }) as Descendant;

describe("updateNodeRecursively", () => {
  it("将文本更新为空字符串时不应再走 insertText 插件链", () => {
    const editor = createEditor();
    editor.children = [createParagraph("hello")] as Descendant[];
    editor.selection = null;

    const originalInsertText = editor.insertText.bind(editor);
    const insertTextSpy = vi.fn((text: string) => originalInsertText(text));
    editor.insertText = insertTextSpy;

    expect(() =>
      updateNodeRecursively(
        editor,
        editor,
        {
          children: [createParagraph("")],
        } as any,
        [],
      ),
    ).not.toThrow();

    expect(insertTextSpy).not.toHaveBeenCalled();
    expect((editor.children[0] as any).children[0].text).toBe("");
  });
});
