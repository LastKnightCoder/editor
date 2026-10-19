import { describe, expect, it } from "vitest";

import { normalizeEditorContent } from "../normalizeEditorContent";

describe("normalizeEditorContent", () => {
  it("加载时保留未知节点及其自定义字段", () => {
    const content = [
      {
        type: "tabs",
        tabsContent: [{ content: [{ type: "question", children: [] }] }],
        children: [{ type: "chat-reference", children: [] }],
      },
    ];
    const result = normalizeEditorContent(content);
    expect(result).toBe(content);
    expect(result[0]).toEqual(content[0]);
  });
  it("空数组时应回退为默认空段落", () => {
    expect(normalizeEditorContent([])).toEqual([
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "" }],
      },
    ]);
  });

  it("非数组时应回退为默认空段落", () => {
    expect(normalizeEditorContent(null)).toEqual([
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "" }],
      },
    ]);
  });

  it("已有内容时应原样返回", () => {
    const content = [
      {
        type: "paragraph",
        children: [{ type: "formatted", text: "hello" }],
      },
    ] as any;

    expect(normalizeEditorContent(content)).toBe(content);
  });
});
