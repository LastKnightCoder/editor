import { createEditor, Descendant, Editor, Transforms } from "slate";
import { describe, expect, it } from "vitest";

import { deleteBackward as withHeaderDeleteBackward } from "../deleteBackward";

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

const selectTextStart = (
  editor: ReturnType<typeof createEditor>,
  path: number[],
) => {
  const point = Editor.start(editor, path);
  Transforms.select(editor, { anchor: point, focus: point });
};

describe("header deleteBackward plugin", () => {
  it("非空标题在行首退格时应移动到上一个块末尾并保持标题状态", () => {
    let editor = createEditor();
    editor = withHeaderDeleteBackward(editor);
    editor.children = [
      createParagraph("前文"),
      createHeader("标题", { collapsed: true }),
      createParagraph("内容"),
    ] as Descendant[];

    selectTextStart(editor, [1]);

    editor.deleteBackward("character");

    expect(editor.children).toEqual([
      createParagraph("前文"),
      createHeader("标题", { collapsed: true }),
      createParagraph("内容"),
    ]);
    expect(editor.selection).toEqual({
      anchor: { path: [0, 0], offset: 2 },
      focus: { path: [0, 0], offset: 2 },
    });
  });

  it("收起标题后的段落在行首退格时不应并入标题", () => {
    let editor = createEditor();
    editor = withHeaderDeleteBackward(editor);
    editor.children = [
      createHeader("标题", { collapsed: true }),
      createParagraph("内容"),
      createParagraph("尾部"),
    ] as Descendant[];

    selectTextStart(editor, [1]);

    editor.deleteBackward("character");

    expect(editor.children).toEqual([
      createHeader("标题", { collapsed: true }),
      createParagraph("内容"),
      createParagraph("尾部"),
    ]);
    expect(editor.selection).toEqual({
      anchor: { path: [0, 0], offset: 2 },
      focus: { path: [0, 0], offset: 2 },
    });
  });

  it("标题自身在行首退格时仍应转换为段落", () => {
    let editor = createEditor();
    editor = withHeaderDeleteBackward(editor);
    editor.children = [
      createHeader("", { collapsed: true }),
      createParagraph("内容"),
    ] as Descendant[];

    selectTextStart(editor, [0]);

    editor.deleteBackward("character");

    expect(editor.children).toEqual([
      createParagraph(""),
      createParagraph("内容"),
    ]);
    expect(editor.selection).toEqual({
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 0 },
    });
  });
});
