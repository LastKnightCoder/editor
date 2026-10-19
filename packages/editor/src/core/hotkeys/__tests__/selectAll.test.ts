import { createEditor, Descendant, Editor } from "slate";
import { describe, expect, it, vi } from "vitest";

import { selectAllCommands } from "../selectAll";

/** void 判定的最小替身：本测试只关心全选命令，schema 细节无关 */
const createVoidElementPlugin =
  (type: string) =>
  (editor: ReturnType<typeof createEditor>): ReturnType<typeof createEditor> => {
    const { isVoid } = editor;
    editor.isVoid = element => element.type === type || isVoid(element);
    return editor;
  };

const createParagraph = (text = "") => ({
  type: "paragraph" as const,
  children: [{ type: "formatted" as const, text }],
});

const createCodeBlock = (code: string) => ({
  type: "code-block" as const,
  code,
  language: "ts",
  uuid: `code-${code}`,
  children: [{ type: "formatted" as const, text: "" }],
});

const createKeyboardEvent = () => {
  return {
    key: "a",
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    defaultPrevented: false,
  } as unknown as React.KeyboardEvent<HTMLDivElement>;
};

describe("select all hotkey", () => {
  it("文档末尾是 void block 时应建立整篇 Slate 选区", () => {
    let editor = createEditor();
    editor = createVoidElementPlugin("code-block")(editor);
    editor.children = [
      createParagraph("intro"),
      createCodeBlock("const answer = 42;"),
    ] as Descendant[];

    const event = createKeyboardEvent();

    selectAllCommands[0].run(editor, { event });

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(editor.selection).toEqual({
      anchor: Editor.start(editor, []),
      focus: Editor.end(editor, []),
    });
  });

  it("文档开头是 void block 时应建立整篇 Slate 选区", () => {
    let editor = createEditor();
    editor = createVoidElementPlugin("code-block")(editor);
    editor.children = [
      createCodeBlock("const answer = 42;"),
      createParagraph("outro"),
    ] as Descendant[];

    const event = createKeyboardEvent();

    selectAllCommands[0].run(editor, { event });

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(editor.selection).toEqual({
      anchor: Editor.start(editor, []),
      focus: Editor.end(editor, []),
    });
  });
});
