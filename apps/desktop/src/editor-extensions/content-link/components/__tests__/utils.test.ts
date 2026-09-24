import { createEditor, Descendant } from "slate";
import { describe, expect, it } from "vitest";

import { wrapContentLink } from "../utils";

describe("wrapContentLink", () => {
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
