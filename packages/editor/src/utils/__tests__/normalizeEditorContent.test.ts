import { describe, expect, it } from "vitest";

import { normalizeEditorContent } from "../normalizeEditorContent";

describe("normalizeEditorContent", () => {
  it("加载时深度清理退役节点及隐藏标签页内容", () => {
    const content = [
      {
        type: "tabs",
        tabsContent: [{ content: [{ type: "question", children: [] }] }],
        children: [{ type: "chat-reference", children: [] }],
      },
    ];
    const result = normalizeEditorContent(content);
    expect(JSON.stringify(result)).not.toMatch(/question|chat-reference/);
    expect(JSON.stringify(content)).toContain("question");
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
