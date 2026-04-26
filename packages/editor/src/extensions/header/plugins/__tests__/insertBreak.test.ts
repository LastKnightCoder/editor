import { createEditor, Descendant, Transforms } from "slate";
import { describe, expect, it } from "vitest";

import { insertBreak as withHeaderInsertBreak } from "../insertBreak";

const createParagraph = (text: string) => ({
  type: "paragraph" as const,
  children: [{ type: "formatted" as const, text }],
});

const createHeader = (text: string, options?: { collapsed?: boolean }) => ({
  type: "header" as const,
  level: 2 as const,
  ...(options?.collapsed ? { collapsed: true } : {}),
  children: [{ type: "formatted" as const, text }],
});

const selectText = (
  editor: ReturnType<typeof createEditor>,
  path: number[],
  offset: number,
) => {
  Transforms.select(editor, {
    anchor: { path, offset },
    focus: { path, offset },
  });
};

describe("header insertBreak plugin", () => {
  it("标题开头按回车时应在上方插入空段落并保持标题内容不变", () => {
    let editor = createEditor();
    editor = withHeaderInsertBreak(editor);
    editor.children = [createHeader("这是一个段落")] as Descendant[];

    selectText(editor, [0, 0], 0);

    editor.insertBreak();

    expect(editor.children).toEqual([
      createParagraph(""),
      createHeader("这是一个段落"),
    ]);
    expect(editor.selection).toEqual({
      anchor: { path: [1, 0], offset: 0 },
      focus: { path: [1, 0], offset: 0 },
    });
  });

  it("标题中间按回车时仍应拆成标题和段落", () => {
    let editor = createEditor();
    editor = withHeaderInsertBreak(editor);
    editor.children = [createHeader("这是一个段落")] as Descendant[];

    selectText(editor, [0, 0], 2);

    editor.insertBreak();

    expect(editor.children).toEqual([
      createHeader("这是"),
      createParagraph("一个段落"),
    ]);
    expect(editor.selection).toEqual({
      anchor: { path: [1, 0], offset: 0 },
      focus: { path: [1, 0], offset: 0 },
    });
  });

  it("标题末尾按回车时仍应在下方插入空段落", () => {
    let editor = createEditor();
    editor = withHeaderInsertBreak(editor);
    editor.children = [createHeader("这是一个段落")] as Descendant[];

    selectText(editor, [0, 0], "这是一个段落".length);

    editor.insertBreak();

    expect(editor.children).toEqual([
      createHeader("这是一个段落"),
      createParagraph(""),
    ]);
    expect(editor.selection).toEqual({
      anchor: { path: [1, 0], offset: 0 },
      focus: { path: [1, 0], offset: 0 },
    });
  });

  it("收起标题在行首按回车时应在上方插入空段落并保持收起", () => {
    let editor = createEditor();
    editor = withHeaderInsertBreak(editor);
    editor.children = [
      createHeader("这是一个段落", { collapsed: true }),
      createParagraph("被收起的内容"),
    ] as Descendant[];

    selectText(editor, [0, 0], 0);

    editor.insertBreak();

    expect(editor.children).toEqual([
      createParagraph(""),
      createHeader("这是一个段落", { collapsed: true }),
      createParagraph("被收起的内容"),
    ]);
    expect(editor.selection).toEqual({
      anchor: { path: [1, 0], offset: 0 },
      focus: { path: [1, 0], offset: 0 },
    });
  });
});
