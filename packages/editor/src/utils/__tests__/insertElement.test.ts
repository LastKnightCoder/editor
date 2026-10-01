import { createEditor, Descendant, Editor, Transforms } from "slate";
import { describe, expect, it } from "vitest";

import { insertBlockquote } from "@tau/editor-blockquote";
import { insertBulletList, insertNumberedList } from "@tau/editor-list";

const createParagraph = (text = "") => ({
  type: "paragraph" as const,
  children: [{ text }],
});

const selectPath = (editor: ReturnType<typeof createEditor>, path: number[], offset = 0) => {
  Transforms.select(editor, {
    anchor: { path, offset },
    focus: { path, offset },
  });
};

describe("insertElement 列表插入焦点", () => {
  it("空段落替换为无序列表后应聚焦到首个列表项", () => {
    const editor = createEditor();
    editor.children = [createParagraph("上一个块"), createParagraph("")] as Descendant[];

    selectPath(editor, [1, 0]);

    insertBulletList(editor);

    expect((editor.children[1] as any).type).toBe("bulleted-list");
    expect(editor.selection).toEqual({
      anchor: Editor.start(editor, [1, 0, 0]),
      focus: Editor.start(editor, [1, 0, 0]),
    });
  });

  it("空段落替换为有序列表后应聚焦到首个列表项", () => {
    const editor = createEditor();
    editor.children = [createParagraph("上一个块"), createParagraph("")] as Descendant[];

    selectPath(editor, [1, 0]);

    insertNumberedList(editor);

    expect((editor.children[1] as any).type).toBe("numbered-list");
    expect(editor.selection).toEqual({
      anchor: Editor.start(editor, [1, 0, 0]),
      focus: Editor.start(editor, [1, 0, 0]),
    });
  });

  it("从非空段落后插入无序列表时应把焦点移到新列表", () => {
    const editor = createEditor();
    editor.children = [createParagraph("当前段落")] as Descendant[];

    selectPath(editor, [0, 0], "当前段落".length);

    insertBulletList(editor);

    expect(editor.children).toHaveLength(2);
    expect((editor.children[1] as any).type).toBe("bulleted-list");
    expect(editor.selection).toEqual({
      anchor: Editor.start(editor, [1, 0, 0]),
      focus: Editor.start(editor, [1, 0, 0]),
    });
  });
});

describe("insertElement 引用块插入", () => {
  it("空段落应替换为引用块", () => {
    const editor = createEditor();
    editor.children = [createParagraph("上一个块"), createParagraph("")] as Descendant[];

    selectPath(editor, [1, 0]);

    insertBlockquote(editor);

    expect(editor.children[1]).toEqual({
      type: "blockquote",
      children: [
        {
          type: "paragraph",
          children: [{ type: "formatted", text: "" }],
        },
      ],
    });
  });

  it("非空段落后应插入新的引用块", () => {
    const editor = createEditor();
    editor.children = [createParagraph("当前段落")] as Descendant[];

    selectPath(editor, [0, 0], "当前段落".length);

    insertBlockquote(editor);

    expect(editor.children).toHaveLength(2);
    expect(editor.children[1]).toEqual({
      type: "blockquote",
      children: [
        {
          type: "paragraph",
          children: [{ type: "formatted", text: "" }],
        },
      ],
    });
  });
});
