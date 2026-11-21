import { createEditor, Descendant, Node, Transforms } from "slate";
import { withHistory } from "slate-history";
import { describe, expect, it } from "vitest";

import { wrapContentLink } from "../utils";

describe("wrapContentLink", () => {
  it("反向选择混合格式的一部分，关联内容与撤销都保留逐段格式", () => {
    const editor = withHistory(createEditor());
    editor.isInline = element => element.type === "content-link";
    const original: Descendant[] = [
      {
        type: "paragraph",
        children: [
          { type: "formatted", text: "前甲", bold: true },
          { type: "formatted", text: "乙", italic: true, highlight: "yellow" },
          { type: "formatted", text: "丙后", color: "red" },
        ],
      },
    ];
    editor.children = original;
    Transforms.select(editor, {
      anchor: { path: [0, 2], offset: 1 },
      focus: { path: [0, 0], offset: 1 },
    });
    wrapContentLink(editor, 101, "card", "标题", 201);
    expect(Node.get(editor, [0])).toMatchObject({
      children: [
        { text: "前", bold: true },
        {
          type: "content-link",
          children: [
            { text: "甲", bold: true },
            { text: "乙", italic: true, highlight: "yellow" },
            { text: "丙", color: "red" },
          ],
        },
        { text: "后", color: "red" },
      ],
    });
    editor.undo();
    expect(editor.children).toEqual(original);
  });

  it("折叠选区插入 content-link 后应把光标放到节点后面", () => {
    const editor = createEditor();
    editor.isInline = element => element.type === "content-link";
    editor.children = [
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "" }],
      },
    ] as Descendant[];
    editor.selection = {
      anchor: { path: [0, 0], offset: 0 },
      focus: { path: [0, 0], offset: 0 },
    };

    wrapContentLink(editor, 101, "project-item", "测试文档", 201, "测试文档");

    expect(editor.selection).toEqual({
      anchor: { path: [0, 2], offset: 0 },
      focus: { path: [0, 2], offset: 0 },
    });
  });
});
