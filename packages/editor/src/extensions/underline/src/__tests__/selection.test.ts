import { createEditor, Editor, Node, Transforms } from "slate";
import { describe, expect, it } from "vitest";
import { createEditorKit } from "@tau/editor";
import { createParagraph } from "@tau/editor/api";
import extension, { wrapUnderline, unwrapUnderline } from "../index";

describe("underline 的公开选区操作", () => {
  it("局部包裹和解包保留原文及叶子标记", () => {
    const editor = createEditorKit({ extensions: [extension] }).assembly.plugins.reduce(
      (editor, plugin) => plugin(editor),
      createEditor()
    );
    const paragraph = createParagraph();
    paragraph.children = [{ type: "formatted", text: "abcd", bold: true }];
    editor.children = [paragraph];
    Transforms.select(editor, {
      anchor: { path: [0, 0], offset: 1 },
      focus: { path: [0, 0], offset: 3 },
    });
    wrapUnderline(editor);
    expect(Node.string(editor)).toBe("abcd");
    const wrappers = [
      ...Editor.nodes(editor, { at: [], match: node => node.type === "underline" }),
    ];
    expect(wrappers).toHaveLength(1);
    expect(Node.string(wrappers[0][0])).toBe("bc");
    expect(Editor.leaf(editor, [...wrappers[0][1], 0])[0]).toMatchObject({
      text: "bc",
      bold: true,
    });
    unwrapUnderline(editor);
    expect(Node.string(editor)).toBe("abcd");
    expect([
      ...Editor.nodes(editor, { at: [], match: node => node.type === "underline" }),
    ]).toHaveLength(0);
  });

  it("没有展开选区时不改变文档", () => {
    const editor = createEditor();
    editor.children = [createParagraph()];
    const before = JSON.stringify(editor.children);
    wrapUnderline(editor);
    expect(JSON.stringify(editor.children)).toBe(before);
  });
});
