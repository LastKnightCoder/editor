import { createEditor, Descendant, Transforms } from "slate";
import { describe, expect, it } from "vitest";

import { withNormalizedCopy } from "../withNormalizedCopy";

const createParagraph = (text: string) => ({
  type: "paragraph" as const,
  children: [{ text }],
});

const selectRange = (
  editor: ReturnType<typeof createEditor>,
  anchor: { path: number[]; offset: number },
  focus: { path: number[]; offset: number },
) => {
  Transforms.select(editor, { anchor, focus });
};

describe("withNormalizedCopy", () => {
  it("列表项内的部分文本复制时不应带出列表结构", () => {
    let editor = createEditor();
    editor = withNormalizedCopy(editor);
    editor.children = [
      {
        type: "bulleted-list",
        children: [
          {
            type: "list-item",
            children: [createParagraph("hello world")],
          },
        ],
      },
    ] as Descendant[];

    selectRange(
      editor,
      { path: [0, 0, 0, 0], offset: 0 },
      { path: [0, 0, 0, 0], offset: 5 },
    );

    expect(editor.getFragment()).toEqual([createParagraph("hello")]);
  });

  it("即使完整选中列表项文本也不应带出列表结构", () => {
    let editor = createEditor();
    editor = withNormalizedCopy(editor);
    editor.children = [
      {
        type: "bulleted-list",
        children: [
          {
            type: "list-item",
            children: [createParagraph("first")],
          },
          {
            type: "list-item",
            children: [createParagraph("second")],
          },
        ],
      },
    ] as Descendant[];

    selectRange(
      editor,
      { path: [0, 0, 0, 0], offset: 0 },
      { path: [0, 0, 0, 0], offset: 5 },
    );

    expect(editor.getFragment()).toEqual([createParagraph("first")]);
  });

  it("高亮块内嵌列表时复制部分文本不应带出任意父容器", () => {
    let editor = createEditor();
    editor = withNormalizedCopy(editor);
    editor.children = [
      {
        type: "highlight-block",
        color: "yellow",
        children: [
          {
            type: "bulleted-list",
            children: [
              {
                type: "list-item",
                children: [createParagraph("nested item")],
              },
            ],
          },
        ],
      },
    ] as Descendant[];

    selectRange(
      editor,
      { path: [0, 0, 0, 0, 0], offset: 0 },
      { path: [0, 0, 0, 0, 0], offset: 6 },
    );

    expect(editor.getFragment()).toEqual([createParagraph("nested")]);
  });

  it("即使完整选中高亮块文本也不应保留高亮块结构", () => {
    let editor = createEditor();
    editor = withNormalizedCopy(editor);
    editor.children = [
      {
        type: "highlight-block",
        color: "red",
        children: [createParagraph("hello world")],
      },
    ] as Descendant[];

    selectRange(
      editor,
      { path: [0, 0, 0], offset: 0 },
      { path: [0, 0, 0], offset: 11 },
    );

    expect(editor.getFragment()).toEqual([createParagraph("hello world")]);
  });

  it("表格单元格内的部分文本复制时应退化为纯内容", () => {
    let editor = createEditor();
    editor = withNormalizedCopy(editor);
    editor.children = [
      {
        type: "table",
        children: [
          {
            type: "table-row",
            children: [{ type: "table-cell", children: [{ text: "hello" }] }],
          },
        ],
      },
    ] as Descendant[];

    selectRange(
      editor,
      { path: [0, 0, 0, 0], offset: 1 },
      { path: [0, 0, 0, 0], offset: 4 },
    );

    expect(editor.getFragment()).toEqual([{ text: "ell" }]);
  });

  it("完整选中单元格时应保留最小表格结构", () => {
    let editor = createEditor();
    editor = withNormalizedCopy(editor);
    editor.children = [
      {
        type: "table",
        children: [
          {
            type: "table-row",
            children: [
              { type: "table-cell", children: [{ text: "left" }] },
              { type: "table-cell", children: [{ text: "right" }] },
            ],
          },
        ],
      },
    ] as Descendant[];

    selectRange(
      editor,
      { path: [0, 0, 0, 0], offset: 0 },
      { path: [0, 0, 0, 0], offset: 4 },
    );

    expect(editor.getFragment()).toEqual([
      {
        type: "table",
        children: [
          {
            type: "table-row",
            children: [{ type: "table-cell", children: [{ text: "left" }] }],
          },
        ],
      },
    ]);
  });
});
