import { createEditor, Descendant, Editor, Transforms } from "slate";
import { describe, expect, it, vi } from "vitest";

import { quitFormattedMarksCommands } from "../formattedText";

const escapeEvent = () =>
  ({
    key: "Escape",
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    defaultPrevented: false,
  }) as unknown as React.KeyboardEvent<HTMLDivElement>;

function editorAt(text: Record<string, unknown>) {
  const editor = createEditor();
  editor.children = [
    { type: "paragraph", children: [{ type: "formatted", text: "正文", ...text }] },
  ] as Descendant[];
  Transforms.select(editor, { path: [0, 0], offset: 1 });
  return editor;
}

const clearMarks = quitFormattedMarksCommands[0];

describe("Esc 清除文本标记", () => {
  it("光标处没有标记时放行 Esc，交给宿主", () => {
    const editor = editorAt({});
    const event = escapeEvent();
    clearMarks.run(editor, { event });
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
  });

  it("有标记时清掉并消费 Esc", () => {
    const editor = editorAt({ bold: true, color: "red" });
    const event = escapeEvent();
    clearMarks.run(editor, { event });
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    const marks = Editor.marks(editor) as Record<string, unknown>;
    expect(marks.bold).toBeUndefined();
    expect(marks.color).toBeUndefined();
  });

  it("清完后再按一次 Esc 放行", () => {
    const editor = editorAt({ italic: true });
    clearMarks.run(editor, { event: escapeEvent() });
    const second = escapeEvent();
    clearMarks.run(editor, { event: second });
    expect(second.stopPropagation).not.toHaveBeenCalled();
  });
});
