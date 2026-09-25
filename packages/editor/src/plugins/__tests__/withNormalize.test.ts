import { createEditor, Descendant, Editor, Transforms } from "slate";
import { describe, expect, it } from "vitest";

import { withNormalize } from "../withNormalize";

const createParagraph = (text: string) => ({
  type: "paragraph" as const,
  children: [{ type: "formatted" as const, text }],
});

describe("withNormalize", () => {
  it("粘贴旧节点时清理整块，正文全空时仍保留可编辑段落", () => {
    const editor = withNormalize(createEditor());
    editor.children = [
      { type: "question", children: [{ type: "formatted", text: "" }] },
    ] as unknown as Descendant[];
    Editor.normalize(editor, { force: true });
    expect(editor.children).toEqual([createParagraph("")]);
  });
  it("整篇内容删除后至少应保留一个空段落", () => {
    let editor = createEditor();
    editor = withNormalize(editor);
    editor.children = [
      createParagraph("before"),
      {
        type: "table",
        children: [
          {
            type: "table-row",
            children: [
              {
                type: "table-cell",
                children: [{ type: "formatted", text: "cell" }],
              },
            ],
          },
        ],
      },
      createParagraph("after"),
    ] as Descendant[];

    Transforms.select(editor, {
      anchor: Editor.start(editor, [0]),
      focus: Editor.end(editor, [2]),
    });

    Transforms.delete(editor, { at: editor.selection! });

    expect(editor.children).toEqual([
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "" }],
      },
    ]);
  });
});
