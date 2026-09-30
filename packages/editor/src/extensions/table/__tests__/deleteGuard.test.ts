import { createEditor, Descendant, Transforms } from "slate";
import { describe, expect, it, vi } from "vitest";

import { withNormalize } from "../../../plugins/withNormalize";
import { withTableDeleteGuard as withTableDeleteBackward } from "../deleteGuard";

const createParagraph = (text: string) => ({
  type: "paragraph" as const,
  children: [{ text }],
});

const selectRange = (
  editor: ReturnType<typeof createEditor>,
  anchor: { path: number[]; offset: number },
  focus: { path: number[]; offset: number }
) => {
  Transforms.select(editor, { anchor, focus });
};

describe("table deleteBackward plugin", () => {
  it("整篇全选且文档中包含表格时应放行原始 delete", () => {
    const originalDelete = vi.fn();
    let editor = createEditor();
    editor.delete = originalDelete as typeof editor.delete;
    editor = withTableDeleteBackward(editor);
    editor.children = [
      createParagraph("before"),
      {
        type: "table",
        children: [
          {
            type: "table-row",
            children: [{ type: "table-cell", children: [{ text: "cell" }] }],
          },
        ],
      },
      createParagraph("after"),
    ] as Descendant[];

    selectRange(editor, { path: [0, 0], offset: 0 }, { path: [2, 0], offset: 5 });

    editor.delete({ unit: "character" });

    expect(originalDelete).toHaveBeenCalledTimes(1);
    expect(originalDelete).toHaveBeenCalledWith({ unit: "character" });
  });

  it("整篇全选走 editor.delete 后至少应保留一个空段落", () => {
    let editor = createEditor();
    editor = withNormalize(editor);
    editor = withTableDeleteBackward(editor);
    editor.children = [
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "before" }],
      },
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
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "after" }],
      },
    ] as Descendant[];

    selectRange(editor, { path: [0, 0], offset: 0 }, { path: [2, 0], offset: 5 });

    editor.delete({ at: editor.selection! } as any);

    expect(editor.children).toEqual([
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "" }],
      },
    ]);
  });

  it("整篇全选且列表项中含表格时走 deleteFragment 后仍应保留空段落", () => {
    let editor = createEditor();
    editor = withNormalize(editor);
    editor = withTableDeleteBackward(editor);
    editor.children = [
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "intro" }],
      },
      {
        type: "bulleted-list",
        children: [
          {
            type: "list-item",
            children: [
              {
                type: "paragraph",
                children: [{ type: "formatted", text: "item" }],
              },
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
            ],
          },
        ],
      },
      {
        type: "table",
        children: [
          {
            type: "table-row",
            children: [
              {
                type: "table-cell",
                children: [{ type: "formatted", text: "summary" }],
              },
            ],
          },
        ],
      },
    ] as Descendant[];

    selectRange(editor, { path: [0, 0], offset: 0 }, { path: [2, 0, 0, 0], offset: 7 });

    editor.deleteFragment();

    expect(editor.children).toEqual([
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "" }],
      },
    ]);
  });

  it("表格内跨多个 cell 的选区删除时应拦截原始 delete", () => {
    const originalDelete = vi.fn();
    let editor = createEditor();
    editor.delete = originalDelete as typeof editor.delete;
    editor = withTableDeleteBackward(editor);
    editor.children = [
      {
        type: "table",
        children: [
          {
            type: "table-row",
            children: [
              { type: "table-cell", children: [{ text: "a" }] },
              { type: "table-cell", children: [{ text: "b" }] },
            ],
          },
        ],
      },
    ] as Descendant[];

    selectRange(editor, { path: [0, 0, 0, 0], offset: 0 }, { path: [0, 0, 1, 0], offset: 1 });

    editor.delete({ unit: "character" });

    expect(originalDelete).not.toHaveBeenCalled();
  });

  it("同一个 cell 内的选区删除时应放行原始 delete", () => {
    const originalDelete = vi.fn();
    let editor = createEditor();
    editor.delete = originalDelete as typeof editor.delete;
    editor = withTableDeleteBackward(editor);
    editor.children = [
      {
        type: "table",
        children: [
          {
            type: "table-row",
            children: [{ type: "table-cell", children: [{ text: "cell" }] }],
          },
        ],
      },
    ] as Descendant[];

    selectRange(editor, { path: [0, 0, 0, 0], offset: 1 }, { path: [0, 0, 0, 0], offset: 3 });

    editor.delete({ unit: "character" });

    expect(originalDelete).toHaveBeenCalledTimes(1);
    expect(originalDelete).toHaveBeenCalledWith({ unit: "character" });
  });
});
