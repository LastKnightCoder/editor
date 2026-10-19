import { createEditor, Descendant } from "slate";
import { describe, expect, it } from "vitest";
import { findPathSafely, getNodeAtPathSafely } from "../path";

const createParagraph = (text: string): Descendant => ({
  type: "paragraph",
  children: [{ type: "formatted", text }],
});

describe("path utils", () => {
  it("findPathSafely 在节点引用失效时返回 undefined", () => {
    const editor = createEditor();
    editor.children = [createParagraph("当前内容")] as Descendant[];

    const staleNode = createParagraph("旧节点");

    expect(findPathSafely(editor, staleNode)).toBeUndefined();
  });

  it("getNodeAtPathSafely 在路径不存在时返回 undefined", () => {
    const editor = createEditor();
    editor.children = [createParagraph("当前内容")] as Descendant[];

    expect(getNodeAtPathSafely(editor, [9])).toBeUndefined();
  });
});
