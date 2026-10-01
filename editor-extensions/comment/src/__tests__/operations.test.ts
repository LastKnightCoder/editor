import { createEditor, Editor, Node, Transforms } from "slate";
import { describe, expect, it } from "vitest";
import { createEditorKit } from "@tau/editor";
import { createParagraph } from "@tau/editor/api";
import extension, { wrapComment, unwrapComment } from "../index";
describe("comment 的公开选区操作", () => {
  it("局部包裹/解包保留原文", () => {
    const editor = createEditorKit({ extensions: [extension] }).assembly.plugins.reduce(
      (value, plugin) => plugin(value),
      createEditor()
    );
    const paragraph = createParagraph();
    paragraph.children = [{ type: "formatted", text: "abcd" }];
    editor.children = [paragraph];
    Transforms.select(editor, {
      anchor: { path: [0, 0], offset: 1 },
      focus: { path: [0, 0], offset: 3 },
    });
    wrapComment(editor);
    expect(Node.string(editor)).toBe("abcd");
    const entries = [...Editor.nodes(editor, { at: [], match: node => node.type === "comment" })];
    expect(entries).toHaveLength(1);
    expect(Node.string(entries[0][0])).toBe("bc");
    Transforms.select(editor, Editor.range(editor, entries[0][1]));
    unwrapComment(editor);
    expect(Node.string(editor)).toBe("abcd");
    expect([
      ...Editor.nodes(editor, { at: [], match: node => node.type === "comment" }),
    ]).toHaveLength(0);
  });
  it("无选区时不改写文档", () => {
    const editor = createEditor();
    editor.children = [createParagraph()];
    const before = JSON.stringify(editor.children);
    wrapComment(editor);
    unwrapComment(editor);
    expect(JSON.stringify(editor.children)).toBe(before);
  });
});
