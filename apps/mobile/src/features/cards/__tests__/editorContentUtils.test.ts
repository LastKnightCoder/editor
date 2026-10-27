import { describe, expect, it } from "vitest";
import type { Descendant } from "slate";
import {
  EMPTY_EDITOR_CONTENT,
  getContentLength,
  isEditorContentEmpty,
  normalizeEditorContent,
} from "../editorContentUtils";

describe("editorContentUtils", () => {
  it("normalizeEditorContent 在空值时回退到默认文档", () => {
    expect(normalizeEditorContent(null)).toEqual(EMPTY_EDITOR_CONTENT);
    expect(normalizeEditorContent([])).toEqual(EMPTY_EDITOR_CONTENT);
  });

  it("getContentLength 计算 formatted / code-block / tabs 全部面板 的内容", () => {
    const content = [
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "a b" }],
      },
      {
        type: "code-block",
        code: "c d",
        children: [{ type: "formatted", text: "" }],
      },
      {
        type: "tabs",
        activeKey: "tab-1",
        children: [
          {
            type: "tab-pane",
            tabKey: "tab-1",
            title: "一",
            children: [{ type: "paragraph", children: [{ type: "formatted", text: "e f" }] }],
          },
          {
            type: "tab-pane",
            tabKey: "tab-2",
            title: "二",
            children: [{ type: "paragraph", children: [{ type: "formatted", text: "g h" }] }],
          },
        ],
      },
    ] as unknown as Descendant[];

    expect(getContentLength(content)).toBe(8);
  });

  it("isEditorContentEmpty 能区分纯空文本与有结构节点内容", () => {
    expect(isEditorContentEmpty(EMPTY_EDITOR_CONTENT)).toBe(true);

    const plainText = [
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "hello" }],
      },
    ] as unknown as Descendant[];
    expect(isEditorContentEmpty(plainText)).toBe(false);

    const structured = [
      {
        type: "image",
        src: "https://example.com/a.png",
        children: [{ type: "formatted", text: "" }],
      },
    ] as unknown as Descendant[];
    expect(isEditorContentEmpty(structured)).toBe(false);
  });
});
